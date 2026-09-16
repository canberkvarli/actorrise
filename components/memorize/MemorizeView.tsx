"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CutLine, CutMeter, type CutLineState } from "@/components/monologue/CutRail";
import { cn } from "@/lib/utils";
import { maskFirstLetters } from "@/lib/memorize";
import { trackEvent } from "@/lib/events";
import { Segmented } from "./Segmented";
import { SettingsPopover } from "./SettingsPopover";
import { SelfRecorder } from "./SelfRecorder";
import {
  FONT_SIZE_CLASS,
  THEME_TOKENS,
  useMemorizePrefs,
  type ThemeTokens,
} from "./prefs";

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
  /**
   * Which furniture this view is standing in.
   *
   * "app" is the original: shadcn tokens, its own bold header, a bordered
   * card. "theatre" is the language the monologue pages speak (see
   * `.t-mem__*` in globals.css) — the page owns the title, so the internal
   * header stands down, and the controls become the same pill-on-a-hard-
   * shadow the working bar uses.
   *
   * Deliberately chrome ONLY. The reading surface itself still belongs to the
   * actor's own theme (default / sepia / dark, see prefs.ts): the one part of
   * this screen someone has chosen for themselves is not the part a redesign
   * gets to take back.
   */
  chrome?: "app" | "theatre";
  /** A saved audition cut (line indices into `lines`), or null when none. */
  cut?: { start: number; end: number } | null;
  /**
   * Save handler. Presence of this prop is what enables Trim mode (monologue
   * context). Scenes don't pass it, so nothing about their view changes.
   * Pass null to clear the cut.
   */
  onSaveCut?: (cut: { start: number; end: number } | null) => void | Promise<void>;
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

const LEVELS: { value: Level; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "hints", label: "Hints" },
  { value: "blank", label: "Blank" },
];

const MODES: { value: Mode; label: string }[] = [
  { value: "read", label: "Read" },
  { value: "buildup", label: "Build up" },
];

/** A subtle blank bar sized to the (hidden) line length, themed. */
function BlankBar({ text, t }: { text: string; t: ThemeTokens }) {
  const ch = Math.max(8, Math.min(text.length, 64));
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-[1.1em] w-full max-w-full align-middle border-b-2 border-dashed",
        t.blankFill,
        t.blankBorder,
      )}
      style={{ width: `${ch}ch` }}
    />
  );
}

/** The chrome around the reading surface, in each of the two languages. */
const CHROME = {
  app: {
    root: "mx-auto max-w-3xl space-y-8",
    header: true,
    bar: "flex flex-wrap items-center gap-3",
    hint: "text-xs text-muted-foreground",
    trimHint: "font-typewriter text-sm text-muted-foreground",
    ghost:
      "rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors cursor-pointer hover:text-foreground",
    go: "rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-colors cursor-pointer hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
    count: "text-sm tabular-nums text-muted-foreground",
    banner: "flex flex-wrap items-center justify-between gap-2 border px-4 py-2.5 text-sm",
    bannerAction:
      "rounded-full px-3 py-1 text-sm font-semibold text-primary transition-opacity cursor-pointer hover:opacity-80",
    recorder: "border-t border-border pt-6",
  },
  theatre: {
    root: "space-y-7",
    header: false,
    bar: "t-mem__bar flex flex-wrap items-center gap-3",
    hint: "t-m__dir m-0 text-[12px]",
    trimHint: "t-m__dir m-0 text-[13px]",
    ghost: "t-mem__ghost",
    go: "t-mem__go",
    count: "t-m__mono text-[12px] tabular-nums",
    banner: "t-mem__banner flex flex-wrap items-center justify-between gap-2",
    bannerAction: "t-mem__link",
    recorder: "t-mem__foot pt-6",
  },
} as const;

export function MemorizeView({
  title,
  subtitle,
  lines,
  cut = null,
  onSaveCut,
  chrome = "app",
}: MemorizeViewProps) {
  const c = CHROME[chrome];
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

  const t = THEME_TOKENS[prefs.theme];
  const sizeClass = FONT_SIZE_CLASS[prefs.fontSize];
  const leading = prefs.spacious ? "leading-[2]" : "leading-relaxed";
  const family = prefs.serif ? "font-sans" : "";

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

    // Trim selection state for this line (indices are absolute in `lines`).
    const inSelection =
      trimming &&
      selStart != null &&
      (selEnd != null
        ? i >= selStart && i <= selEnd
        : i === selStart);
    const dimmed = trimming && hasFullSelection && !inSelection;

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
          {showSpeaker && (
            <p
              className={cn(
                "mb-1.5 pl-12 text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
                t.inkFaint,
              )}
            >
              {line.speaker}
            </p>
          )}
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
        className={cn(
          "relative",
          // Actor's own line: a quiet accent rail rather than a loud border.
          line.mine && "pl-4",
        )}
      >
        {line.mine && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-1.5 bottom-1.5 w-px rounded-full",
              opts.newest ? "bg-primary" : "bg-primary/30",
            )}
          />
        )}

        {showSpeaker && (
          <p
            className={cn(
              "mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
              line.mine ? "text-primary/80" : t.inkFaint,
            )}
          >
            {line.speaker}
          </p>
        )}

        {line.mine ? (
          <button
            type="button"
            onClick={() => toggleReveal(i)}
            aria-label={isPeeked ? "Hide this line" : "Peek at this line"}
            className={cn(
              "-mx-2 block w-full cursor-pointer rounded-lg px-2 py-1 text-left transition-colors",
              t.hover,
            )}
          >
            {opts.masked ? (
              level === "hints" && mode === "read" ? (
                <span
                  className={cn(
                    "block font-mono tracking-wide",
                    sizeClass,
                    leading,
                    t.ink,
                  )}
                >
                  {maskFirstLetters(line.text)}
                </span>
              ) : (
                <BlankBar text={line.text} t={t} />
              )
            ) : (
              <span className={cn("block", family, sizeClass, leading, t.ink)}>
                {line.text}
              </span>
            )}
          </button>
        ) : (
          // Partner / cue lines — always full, visually quieter.
          <p className={cn(family, sizeClass, leading, t.inkMuted)}>
            {line.text}
          </p>
        )}

        {line.stageDirection && (
          <p className={cn("mt-1.5 text-sm italic", t.inkFaint)}>
            [{line.stageDirection}]
          </p>
        )}
      </motion.div>
    );
  };

  return (
    <div className={c.root}>
      {/* The title. Only when this view is the whole screen — in the theatre
          chrome the page has already said what piece this is, in the display
          face, and a second bold heading under it is the same sentence twice
          in two different voices. */}
      {c.header && (
        <header className="space-y-1.5">
          <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground sm:text-base">
              {subtitle}
            </p>
          )}
        </header>
      )}

      {/* Toolbar */}
      {trimming ? (
        <div className="space-y-3">
          {/* Same readout as the Cut tab: length against the whole piece and
              against the limits rooms give you, rather than a bare line count.
              "4 lines" is not a fact an actor can act on; "0:27, 0:52 trimmed"
              is. */}
          <CutMeter
            cutSeconds={selCount > 0 ? selSeconds : fullSeconds}
            fullSeconds={fullSeconds}
          />
          <p className={c.trimHint} aria-live="polite">
            {selStart == null
              ? "Tap where your cut starts."
              : selEnd == null
                ? "Now tap where it ends."
                : "Tap any line to start a new cut."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {cut && (
              <button
                type="button"
                onClick={clearCut}
                disabled={savingCut}
                className={c.ghost}
              >
                Clear cut
              </button>
            )}
            <button
              type="button"
              onClick={cancelTrim}
              disabled={savingCut}
              className={c.ghost}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveCut}
              disabled={!hasFullSelection || savingCut}
              className={c.go}
            >
              {savingCut ? "Saving…" : "Save cut"}
            </button>
          </div>
        </div>
      ) : (
        <div className={c.bar}>
          <Segmented
            ariaLabel="Learning mode"
            options={MODES}
            value={mode}
            onChange={switchMode}
            tone={chrome}
          />

          {mode === "read" && (
            <Segmented
              ariaLabel="Reveal level"
              options={LEVELS}
              value={level}
              onChange={setLevel}
              tone={chrome}
            />
          )}

          {mode === "buildup" && (
            <span className={c.count}>
              {builtUpTo} / {viewEntries.length}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {canTrim && (
              <button type="button" onClick={enterTrim} className={c.ghost}>
                {cut ? "Edit cut" : "Trim"}
              </button>
            )}
            <SettingsPopover prefs={prefs} update={update} tone={chrome} />
          </div>
        </div>
      )}

      <p className={c.hint}>
        {trimming
          ? "Tap your first line, then your last line."
          : mode === "read"
            ? "Tap a hidden line to peek."
            : "Recall each line from the top, then add the next. Tap a blank to peek."}
      </p>

      {/* Applied-cut banner */}
      {cut && !trimming && (
        <div
          className={cn(
            c.banner,
            chrome === "app" && "text-sm",
            chrome === "app" && t.surface,
            chrome === "app" && t.hair,
          )}
        >
          <span className={chrome === "app" ? t.inkMuted : undefined}>
            {showFull
              ? "Showing the full piece"
              : `Showing your cut · ~${fmtTime(cutSeconds)}`}
          </span>
          <button
            type="button"
            onClick={toggleShowFull}
            className={c.bannerAction}
          >
            {showFull ? "Show cut" : "Show full"}
          </button>
        </div>
      )}

      {/* Reading surface */}
      <div
        className={cn(
          "rounded-2xl border px-5 py-8 transition-colors sm:px-10 sm:py-12",
          t.surface,
          t.hair,
        )}
      >
        <div className={cn(prefs.spacious ? "space-y-8" : "space-y-6")}>
          {trimming || mode === "read"
            ? viewEntries.map(({ line, index }) =>
                renderLine(line, index, {
                  masked:
                    !trimming &&
                    line.mine &&
                    level !== "full" &&
                    !revealed.has(index),
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
          <div className={cn("mt-8 flex flex-wrap items-center gap-3 border-t pt-6", t.hair)}>
            {atEnd ? (
              <p className={cn("text-sm", t.inkMuted)}>
                You&apos;ve built the whole piece — run it from the top.
              </p>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setBuiltUpTo((n) => Math.min(n + 1, viewEntries.length))
                }
                className={cn(
                  "rounded-full border px-5 py-2 text-sm font-semibold transition-opacity cursor-pointer hover:opacity-80",
                  t.hair,
                  t.ink,
                )}
              >
                Add next line
              </button>
            )}
            {builtUpTo > 1 && (
              <button
                type="button"
                onClick={startOver}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium transition-opacity cursor-pointer hover:opacity-80",
                  t.hair,
                  t.inkMuted,
                )}
              >
                Start over
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recorder — tucked beneath the reading view so it stays calm. */}
      <div className={c.recorder}>
        <SelfRecorder />
      </div>
    </div>
  );
}

export default MemorizeView;
