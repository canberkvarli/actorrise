"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CutLine, CutMeter, type CutLineState } from "@/components/monologue/CutRail";
import { cn } from "@/lib/utils";
import { maskFirstLetters } from "@/lib/memorize";
import { trackEvent } from "@/lib/events";
import { SettingsPopover } from "./SettingsPopover";
import { SelfRecorder } from "./SelfRecorder";
import { FONT_SIZE_CLASS, useMemorizePrefs } from "./prefs";

type Level = "full" | "hints" | "blank";
type Mode = "read" | "buildup";

export interface MemorizeLine {
  /** Character speaking this line; null for monologues (no labels). */
  speaker: string | null;
  text: string;
  /** True when this is the actor's own line (gets masked). */
  mine: boolean;
  stageDirection?: string | null;
}

export interface MemorizeViewProps {
  title: string;
  subtitle?: string;
  lines: MemorizeLine[];
  /** A saved audition cut (line indices into `lines`), or null when none. */
  cut?: { start: number; end: number } | null;
  /**
   * Save handler. Presence of this prop is what enables Trim mode (monologue
   * context). Scenes don't pass it, so nothing about their view changes.
   * Pass null to clear the cut.
   */
  onSaveCut?: (cut: { start: number; end: number } | null) => void | Promise<void>;
  /** Rendered at the top-right of the head — the way back, the way on. */
  headActions?: React.ReactNode;
  /** Rendered at the foot beside the recorder — "off book". */
  footActions?: React.ReactNode;
}

/** Rough spoken duration of a slice of lines, ~150 wpm. */
function estimateSeconds(lines: MemorizeLine[]): number {
  const words = lines.reduce(
    (n, l) => n + (l.text.trim() ? l.text.trim().split(/\s+/).length : 0),
    0,
  );
  return Math.round((words / 150) * 60);
}

/** Format seconds as M:SS. */
function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* One axis, three stops: the house lights coming down on your own lines. This
   was a `Segmented` identical to the Read / Build-up one sitting beside it, so
   nothing said which control was the mode and which was the difficulty. The
   lamp dims as you travel it, which is the whole explanation the control
   needs — it replaces the sentence that used to sit under the toolbar. */
const STOPS: { value: Level; label: string }[] = [
  { value: "full", label: "full" },
  { value: "hints", label: "hints" },
  { value: "blank", label: "blank" },
];

function Dimmer({ value, onChange }: { value: Level; onChange: (v: Level) => void }) {
  return (
    <div className="t-dim" data-level={value}>
      <span aria-hidden className="t-dim__lamp" />
      <div className="t-dim__stops" role="radiogroup" aria-label="How much of your lines to show">
        {STOPS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={value === s.value}
            onClick={() => onChange(s.value)}
            className="t-dim__stop"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MemorizeView({
  title,
  subtitle,
  lines,
  cut = null,
  onSaveCut,
  headActions,
  footActions,
}: MemorizeViewProps) {
  const { prefs, update } = useMemorizePrefs();
  const [mode, setMode] = useState<Mode>("read");
  const [level, setLevel] = useState<Level>("full");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // Number of lines revealed from the top in Build-up mode (cumulative method).
  const [builtUpTo, setBuiltUpTo] = useState(1);

  // Trim (audition cut) state — only ever active when onSaveCut is provided.
  const canTrim = typeof onSaveCut === "function";
  const [trimming, setTrimming] = useState(false);
  /** Line under the cursor while choosing the trim end, for the live preview. */
  const [trimHover, setTrimHover] = useState<number | null>(null);
  const [savingCut, setSavingCut] = useState(false);
  const [selection, setSelection] = useState<{
    start: number | null;
    end: number | null;
  }>({ start: null, end: null });
  // When a cut is saved, the reading/build-up views show only the cut by
  // default. "Show full" reveals everything.
  const [showFull, setShowFull] = useState(false);

  const sizeClass = FONT_SIZE_CLASS[prefs.fontSize];
  const leading = prefs.spacious ? "leading-[2]" : "leading-[1.75]";
  /* The lines are the typewriter face, like monologue text everywhere else in
     the product. `plainType` is the way out for anyone who finds a monospace
     hard going at length. */
  const face = prefs.plainType ? "font-sans" : "";

  const toggleReveal = (index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    // Reset peeks on every mode switch so the view isn't confusing.
    setRevealed(new Set());
    // Entering Build-up always starts the snowball from the top.
    if (next === "buildup") setBuiltUpTo(1);
  };

  const startOver = () => {
    setBuiltUpTo(1);
    setRevealed(new Set());
  };

  // The line set the Read / Build-up views actually operate on. When a cut is
  // saved and we're NOT showing full and NOT trimming, this is just the cut
  // slice; otherwise it's the full piece. We keep ORIGINAL indices alongside
  // each entry so renderLine, peeks, and trim-selection all stay correct
  // against the master `lines` array.
  const usingCut = !!cut && !showFull && !trimming;
  const viewEntries: { line: MemorizeLine; index: number }[] = (() => {
    const all = lines.map((line, index) => ({ line, index }));
    if (usingCut && cut) return all.slice(cut.start, cut.end + 1);
    return all;
  })();

  const atEnd = builtUpTo >= viewEntries.length;

  // ---- Trim mode -----------------------------------------------------------

  const enterTrim = () => {
    // The memorize screen's own way into the cut editor; the detail page
    // reports surface "detail". No monologue id in these props by design.
    trackEvent("cut_editor_opened", { surface: "memorize" });
    setTrimming(true);
    setShowFull(false);
    setMode("read");
    setRevealed(new Set());
    // Pre-seed the selection from an existing cut so it's easy to adjust.
    setSelection(cut ? { start: cut.start, end: cut.end } : { start: null, end: null });
  };

  const cancelTrim = () => {
    setTrimming(false);
    setTrimHover(null);
    setSelection({ start: null, end: null });
  };

  // Tap behavior during Trim: first tap = start, second = end (swap if needed),
  // a third tap restarts the selection from that line.
  const pickTrimLine = (index: number) => {
    setTrimHover(null);
    setSelection((sel) => {
      if (sel.start == null || sel.end != null) {
        return { start: index, end: null };
      }
      const start = Math.min(sel.start, index);
      const end = Math.max(sel.start, index);
      return { start, end };
    });
  };

  const selStart = selection.start;
  const selEnd = selection.end;
  const hasFullSelection = selStart != null && selEnd != null;

  const selectedLines = hasFullSelection
    ? lines.slice(selStart, selEnd + 1)
    : selStart != null
      ? [lines[selStart]]
      : [];
  const selCount = hasFullSelection ? selEnd - selStart + 1 : selStart != null ? 1 : 0;
  const selSeconds = estimateSeconds(selectedLines);

  const saveCut = async () => {
    if (!onSaveCut || !hasFullSelection) return;
    setSavingCut(true);
    try {
      await onSaveCut({ start: selStart, end: selEnd });
      setTrimming(false);
      setSelection({ start: null, end: null });
      setShowFull(false);
    } finally {
      setSavingCut(false);
    }
  };

  const clearCut = async () => {
    if (!onSaveCut) return;
    setSavingCut(true);
    try {
      await onSaveCut(null);
      setTrimming(false);
      setSelection({ start: null, end: null });
      setShowFull(false);
    } finally {
      setSavingCut(false);
    }
  };

  // Toggle between cut-only and full views, resetting Build-up progress so the
  // snowball restarts against whichever line set is now showing.
  const toggleShowFull = () => {
    setShowFull((v) => !v);
    setBuiltUpTo(1);
    setRevealed(new Set());
  };

  const cutSeconds = cut ? estimateSeconds(lines.slice(cut.start, cut.end + 1)) : 0;
  /** The whole piece, which is what the trim meter measures against. */
  const fullSeconds = estimateSeconds(lines);

  /** Render a single line. In Build-up mode "mine" lines are always blanks
   *  (unless peeked); `newest` highlights the just-added line. */
  const renderLine = (
    line: MemorizeLine,
    i: number,
    opts: { masked: boolean; newest?: boolean },
  ) => {
    const prev = lines[i - 1];
    const showSpeaker =
      line.speaker != null && (i === 0 || prev?.speaker !== line.speaker);
    const isPeeked = revealed.has(i);

    if (trimming) {
      /* Same selection language as the Cut tab — see components/monologue/
         CutRail.tsx. This used to be its own thing: a 3px rail plus
         `bg-primary/5`, a five percent wash, and a line took no styling at all
         until BOTH ends were picked. You could not tell you had chosen the
         first line, which is exactly the complaint the Cut tab got. */
      let state: CutLineState = "out";
      let edge: "in" | "out" | null = null;
      if (selStart == null) {
        state = "neutral";
      } else if (selEnd == null) {
        const a = trimHover == null ? selStart : Math.min(selStart, trimHover);
        const b = trimHover == null ? selStart : Math.max(selStart, trimHover);
        if (i >= a && i <= b) state = trimHover == null ? "start-only" : "preview";
        if (i === selStart) edge = "in";
        if (trimHover != null && i === trimHover) edge = "out";
      } else {
        if (i >= selStart && i <= selEnd) state = "in";
        if (i === selStart) edge = "in";
        if (i === selEnd) edge = "out";
      }

      return (
        <div key={i}>
          {showSpeaker && <p className="t-mem__speaker pl-12">{line.speaker}</p>}
          <CutLine
            text={line.text}
            state={state}
            edge={edge}
            onClick={() => pickTrimLine(i)}
            onHover={() => setTrimHover(i)}
          />
        </div>
      );
    }

    return (
      <motion.div
        key={i}
        initial={opts.newest ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={
          opts.newest
            ? { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }
            : { duration: 0 }
        }
      >
        {showSpeaker && <p className="t-mem__speaker">{line.speaker}</p>}

        {line.mine ? (
          <button
            type="button"
            onClick={() => toggleReveal(i)}
            aria-label={isPeeked ? "Hide this line" : "Peek at this line"}
            className="t-mem__peek"
          >
            {opts.masked ? (
              level === "hints" && mode === "read" ? (
                <span className={cn("t-mem__hint", sizeClass, leading)}>
                  {maskFirstLetters(line.text)}
                </span>
              ) : (
                /* A ruled blank the width of the words it hides, so the shape
                   of the speech survives being covered. */
                <span
                  aria-hidden
                  className="t-mem__blank"
                  style={{ width: `${Math.max(8, Math.min(line.text.length, 64))}ch` }}
                />
              )
            ) : (
              <span className={cn("t-mem__line block", face, sizeClass, leading)}>{line.text}</span>
            )}
          </button>
        ) : (
          // Partner / cue lines — always full, visually quieter.
          <p className={cn("t-mem__line t-mem__line--cue", face, sizeClass, leading)}>{line.text}</p>
        )}

        {line.stageDirection && <p className="t-mem__dir">({line.stageDirection})</p>}
      </motion.div>
    );
  };

  return (
    <div className="t-mem" data-paper={prefs.theme}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {subtitle && <p className="t-mem__slug">{subtitle}</p>}
          <h1 className="t-mem__title">{title}</h1>
        </div>
        {headActions && <div className="flex shrink-0 items-center gap-2">{headActions}</div>}
      </header>

      {/* The rail. One row, and the dimmer leads it. */}
      <div className="t-mem__rail">
        {trimming ? (
          <>
            <span className="t-mem__count" aria-live="polite">
              {selStart == null
                ? "tap where the cut starts"
                : selEnd == null
                  ? "now tap where it ends"
                  : `${selCount} lines · ~${fmtTime(selSeconds)}`}
            </span>
            <div className="t-mem__rail-end">
              {cut && (
                <button
                  type="button"
                  onClick={clearCut}
                  disabled={savingCut}
                  className="t-mem__toggle"
                >
                  clear
                </button>
              )}
              <button
                type="button"
                onClick={cancelTrim}
                disabled={savingCut}
                className="t-mem__toggle"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={saveCut}
                disabled={!hasFullSelection || savingCut}
                className="t-mem__toggle t-mem__toggle--go"
              >
                {savingCut ? "saving…" : "save cut"}
              </button>
            </div>
          </>
        ) : (
          <>
            <Dimmer value={level} onChange={setLevel} />

            <button
              type="button"
              aria-pressed={mode === "buildup"}
              onClick={() => switchMode(mode === "buildup" ? "read" : "buildup")}
              className="t-mem__toggle"
            >
              build up
            </button>

            {mode === "buildup" && (
              <span className="t-mem__count">
                {builtUpTo} of {viewEntries.length} standing
              </span>
            )}

            <div className="t-mem__rail-end">
              {canTrim && (
                <button type="button" onClick={enterTrim} className="t-mem__toggle">
                  {cut ? "edit cut" : "trim"}
                </button>
              )}
              <SettingsPopover prefs={prefs} update={update} />
            </div>
          </>
        )}
      </div>

      {trimming && (
        <div className="mt-5">
          {/* Length against the whole piece and against the limits rooms give
              you, rather than a bare line count. "4 lines" is not a fact an
              actor can act on; "0:27, 0:52 trimmed" is. */}
          <CutMeter
            cutSeconds={selCount > 0 ? selSeconds : fullSeconds}
            fullSeconds={fullSeconds}
          />
        </div>
      )}

      {cut && !trimming && (
        <p className="t-mem__cut">
          <span>
            {showFull ? "the whole piece" : `your cut · ~${fmtTime(cutSeconds)}`}
          </span>
          <button type="button" onClick={toggleShowFull} className="t-mem__toggle">
            {showFull ? "show the cut" : "show it all"}
          </button>
        </p>
      )}

      {/* The page. */}
      <div className={cn("t-mem__page", prefs.spacious ? "space-y-8" : "space-y-6")}>
        {trimming || mode === "read"
          ? viewEntries.map(({ line, index }) =>
              renderLine(line, index, {
                masked:
                  !trimming && line.mine && level !== "full" && !revealed.has(index),
              }),
            )
          : viewEntries.slice(0, builtUpTo).map(({ line, index }, pos) =>
              renderLine(line, index, {
                masked: line.mine && !revealed.has(index),
                newest: pos === builtUpTo - 1,
              }),
            )}
      </div>

      {!trimming && mode === "buildup" && (
        <div className="mt-9 flex flex-wrap items-center gap-3">
          {atEnd ? (
            <p className="t-mem__count">the whole piece is standing. run it from the top.</p>
          ) : (
            <button
              type="button"
              onClick={() => setBuiltUpTo((n) => Math.min(n + 1, viewEntries.length))}
              className="t-mem__toggle t-mem__toggle--go"
            >
              add the next line
            </button>
          )}
          {builtUpTo > 1 && (
            <button type="button" onClick={startOver} className="t-mem__toggle">
              start over
            </button>
          )}
        </div>
      )}

      {!trimming && (
        <div className="t-mem__foot">
          {footActions}
          <SelfRecorder />
        </div>
      )}
    </div>
  );
}

export default MemorizeView;
