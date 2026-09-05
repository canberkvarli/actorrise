"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Monologue } from "@/types/actor";
import { useSaveCut } from "@/hooks/useCollectionMeta";
import { estimateDurationSeconds, formatClock } from "@/lib/estimateDuration";
import { monologueSegments } from "@/lib/monologueSegments";
import { CutMeter, CutLine, type CutLineState } from "@/components/monologue/CutRail";

/**
 * Audition cut editor: pick the first and last unit of your cut and the live
 * duration updates as you go, so trimming to a 1- or 2-minute limit stops
 * being a Google-Doc chore.
 *
 * The units come from monologueSegments() — sentences for prose, lines for
 * verse — and the saved indices are positions in that array, which is what the
 * export applies. It used to be text.split("\n") on both sides, which sounds
 * equivalent and was not: 98.2% of this corpus has no newline, so the editor
 * showed a single row containing the whole speech and cutting was impossible.
 *
 * Every actor cuts to fit a time limit; this makes the cut a property the actor
 * owns on the piece, not a throwaway copy.
 */
export function CutEditor({
  monologue,
  onSaved,
  embedded = false,
}: {
  monologue: Monologue;
  onSaved?: (start: number | null, end: number | null) => void;
  /** Inside a labelled tab the "Your cut" heading just repeats the tab, so drop
   *  it and keep the parts that carry information: the instruction and clock. */
  embedded?: boolean;
}) {
  const lines = useMemo(() => monologueSegments(monologue.text), [monologue.text]);
  // Indices of the lines that actually carry words — only these are selectable.
  const spokenIdx = useMemo(
    () => lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0),
    [lines],
  );

  const initialStart = monologue.cut_start_line ?? null;
  const initialEnd = monologue.cut_end_line ?? null;
  const [start, setStart] = useState<number | null>(initialStart);
  const [end, setEnd] = useState<number | null>(initialEnd);
  /** Line under the cursor while choosing the end, for the live preview. */
  const [hovered, setHovered] = useState<number | null>(null);
  const saveCut = useSaveCut();

  const hasCut = start !== null && end !== null;
  const lo = hasCut ? Math.min(start!, end!) : null;
  const hi = hasCut ? Math.max(start!, end!) : null;

  const fullSeconds = monologue.estimated_duration_seconds || estimateDurationSeconds(monologue.text ?? "");
  const cutSeconds = useMemo(() => {
    if (lo === null || hi === null) return fullSeconds;
    return estimateDurationSeconds(lines.slice(lo, hi + 1).join("\n"));
  }, [lo, hi, lines, fullSeconds]);

  const dirty = start !== initialStart || end !== initialEnd;

  function handleLineClick(idx: number) {
    // First tap sets the start; second sets the end; a third starts over.
    if (start === null || (start !== null && end !== null)) {
      setStart(idx);
      setEnd(null);
    } else {
      setEnd(idx);
    }
    setHovered(null);
  }

  function clear() {
    setStart(null);
    setEnd(null);
    setHovered(null);
  }

  async function save() {
    const s = lo;
    const e = hi;
    try {
      await saveCut.mutateAsync({ monologueId: monologue.id, start: s, end: e });
      toast.success(s === null ? "Cut cleared" : `Cut saved · ${formatClock(cutSeconds)}`);
      onSaved?.(s, e);
    } catch {
      toast.error("Couldn't save the cut. Try again.");
    }
  }

  /* Which step you are on, said out loud. The control is a two-tap gesture and
     nothing ever named the second tap, so after choosing a start the screen
     looked identical to before you had chosen anything. */
  const phase: "idle" | "picking-end" | "done" =
    start === null ? "idle" : end === null ? "picking-end" : "done";

  const instruction = {
    idle: "Tap where your cut starts.",
    "picking-end": "Now tap where it ends.",
    done: "Tap any line to start a new cut.",
  }[phase];

  /* Live length of the cut you would get by ending on the hovered line, so the
     length is visible BEFORE you commit rather than after. */
  const previewSeconds = useMemo(() => {
    if (phase !== "picking-end" || hovered === null || start === null) return null;
    const a = Math.min(start, hovered);
    const b = Math.max(start, hovered);
    return estimateDurationSeconds(lines.slice(a, b + 1).join("\n"));
  }, [phase, hovered, start, lines]);

  return (
    <div className="space-y-5" onMouseLeave={() => setHovered(null)}>
      {!embedded && <h2 className="text-base font-semibold">Your cut</h2>}

      <CutMeter
        cutSeconds={hasCut ? cutSeconds : fullSeconds}
        fullSeconds={fullSeconds}
        previewSeconds={previewSeconds}
      />

      <p className="font-typewriter text-sm text-muted-foreground" aria-live="polite">
        {instruction}
      </p>

      <div className="font-typewriter text-base leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) return null;

          let state: CutLineState = "out";
          let edge: "in" | "out" | null = null;

          if (phase === "done" && lo !== null && hi !== null) {
            if (idx >= lo && idx <= hi) state = "in";
            if (idx === lo) edge = "in";
            if (idx === hi) edge = "out";
          } else if (phase === "picking-end" && start !== null) {
            const a = hovered === null ? start : Math.min(start, hovered);
            const b = hovered === null ? start : Math.max(start, hovered);
            if (idx >= a && idx <= b) state = hovered === null ? "start-only" : "preview";
            if (idx === start) edge = "in";
            if (hovered !== null && idx === hovered) edge = "out";
          } else {
            // Nothing chosen yet: the piece reads normally — full contrast, no
            // rail. Giving every line the selected rail said "all of this is
            // your cut", which is the opposite of "choose where it starts".
            state = "neutral";
          }

          return (
            <CutLine
              key={idx}
              text={line}
              state={state}
              edge={edge}
              onClick={() => handleLineClick(idx)}
              onHover={() => setHovered(idx)}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!dirty || saveCut.isPending}>
          {saveCut.isPending ? "Saving…" : "Save cut"}
        </Button>
        {hasCut && (
          <button
            type="button"
            onClick={clear}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Clear cut
          </button>
        )}
        {spokenIdx.length === 0 && (
          <span className="text-sm text-muted-foreground">No text to cut.</span>
        )}
      </div>
    </div>
  );
}
