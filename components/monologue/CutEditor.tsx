"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Monologue } from "@/types/actor";
import { useSaveCut } from "@/hooks/useCollectionMeta";
import { estimateDurationSeconds, formatClock } from "@/lib/estimateDuration";

/**
 * Audition cut editor: pick the first and last spoken line of your cut and the
 * live duration updates as you go, so trimming to a 1- or 2-minute limit stops
 * being a Google-Doc chore. Line indices are into text.split("\n"), the same
 * convention the export uses.
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
  const lines = useMemo(() => (monologue.text ?? "").split("\n"), [monologue.text]);
  // Indices of the lines that actually carry words — only these are selectable.
  const spokenIdx = useMemo(
    () => lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0),
    [lines],
  );

  const initialStart = monologue.cut_start_line ?? null;
  const initialEnd = monologue.cut_end_line ?? null;
  const [start, setStart] = useState<number | null>(initialStart);
  const [end, setEnd] = useState<number | null>(initialEnd);
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
  }

  function clear() {
    setStart(null);
    setEnd(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          {!embedded && <h2 className="text-base font-semibold">Your cut</h2>}
          <p className="text-sm text-muted-foreground">
            {hasCut ? "Tap a line to start a new cut." : "Tap the first and last line of your cut."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-typewriter text-lg tabular-nums text-foreground">
            {formatClock(cutSeconds)}
          </div>
          {hasCut && (
            <div className="text-xs text-muted-foreground">of {formatClock(fullSeconds)} full</div>
          )}
        </div>
      </div>

      <div className="font-typewriter text-base leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-3" aria-hidden />;
          const inCut = lo !== null && hi !== null && idx >= lo && idx <= hi;
          const isEndpoint = idx === start || idx === end;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => handleLineClick(idx)}
              className={`block w-full text-left transition-colors px-3 py-0.5 border-l-2 ${
                inCut
                  ? "border-l-[#CB4B00] bg-primary/[0.06] text-foreground"
                  : "border-l-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              } ${isEndpoint ? "font-semibold" : ""}`}
              aria-pressed={inCut}
            >
              {line}
            </button>
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
