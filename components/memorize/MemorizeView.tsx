"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { maskFirstLetters } from "@/lib/memorize";
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

export function MemorizeView({ title, subtitle, lines }: MemorizeViewProps) {
  const { prefs, update } = useMemorizePrefs();
  const [mode, setMode] = useState<Mode>("read");
  const [level, setLevel] = useState<Level>("full");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // Number of lines revealed from the top in Build-up mode (cumulative method).
  const [builtUpTo, setBuiltUpTo] = useState(1);

  const t = THEME_TOKENS[prefs.theme];
  const sizeClass = FONT_SIZE_CLASS[prefs.fontSize];
  const leading = prefs.spacious ? "leading-[2]" : "leading-relaxed";
  const family = prefs.serif ? "font-serif" : "";

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

  const atEnd = builtUpTo >= lines.length;

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

    return (
      <div
        key={i}
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
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground sm:text-base">
            {subtitle}
          </p>
        )}
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Learning mode"
          options={MODES}
          value={mode}
          onChange={switchMode}
        />

        {mode === "read" && (
          <Segmented
            ariaLabel="Reveal level"
            options={LEVELS}
            value={level}
            onChange={setLevel}
          />
        )}

        {mode === "buildup" && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {builtUpTo} / {lines.length}
          </span>
        )}

        <div className="ml-auto">
          <SettingsPopover prefs={prefs} update={update} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === "read"
          ? "Tap a hidden line to peek."
          : "Recall each line from the top, then add the next. Tap a blank to peek."}
      </p>

      {/* Reading surface */}
      <div
        className={cn(
          "rounded-2xl border px-5 py-8 transition-colors sm:px-10 sm:py-12",
          t.surface,
          t.hair,
        )}
      >
        <div className={cn(prefs.spacious ? "space-y-8" : "space-y-6")}>
          {mode === "read"
            ? lines.map((line, i) =>
                renderLine(line, i, {
                  masked: line.mine && level !== "full" && !revealed.has(i),
                }),
              )
            : lines.slice(0, builtUpTo).map((line, i) =>
                renderLine(line, i, {
                  masked: line.mine && !revealed.has(i),
                  newest: i === builtUpTo - 1,
                }),
              )}
        </div>

        {mode === "buildup" && (
          <div className={cn("mt-8 flex flex-wrap items-center gap-3 border-t pt-6", t.hair)}>
            {atEnd ? (
              <p className={cn("text-sm", t.inkMuted)}>
                You&apos;ve built the whole piece — run it from the top.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setBuiltUpTo((n) => Math.min(n + 1, lines.length))}
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
      <div className="border-t border-border pt-6">
        <SelfRecorder />
      </div>
    </div>
  );
}

export default MemorizeView;
