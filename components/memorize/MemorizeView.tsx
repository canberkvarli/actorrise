"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { maskFirstLetters } from "@/lib/memorize";

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

/** A subtle blank bar sized to the (hidden) line length. */
function BlankBar({ text }: { text: string }) {
  // Approximate width from the word/char count so longer lines read as longer.
  const ch = Math.max(8, Math.min(text.length, 64));
  return (
    <span
      aria-hidden
      className="inline-block h-[1.1em] w-full max-w-full align-middle border-b-2 border-dashed border-muted-foreground/40 bg-muted/40"
      style={{ width: `${ch}ch` }}
    />
  );
}

export function MemorizeView({ title, subtitle, lines }: MemorizeViewProps) {
  const [mode, setMode] = useState<Mode>("read");
  const [level, setLevel] = useState<Level>("full");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  // Number of lines revealed from the top in Build-up mode (cumulative method).
  const [builtUpTo, setBuiltUpTo] = useState(1);

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
          "space-y-1.5",
          opts.newest && "border-l-2 border-primary pl-3",
        )}
      >
        {showSpeaker && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {line.speaker}
          </p>
        )}

        {line.mine ? (
          <button
            type="button"
            onClick={() => toggleReveal(i)}
            aria-label={isPeeked ? "Hide this line" : "Peek at this line"}
            className="block w-full cursor-pointer rounded-lg px-1 text-left transition-colors hover:bg-muted/50"
          >
            {opts.masked ? (
              level === "hints" && mode === "read" ? (
                <span className="block font-mono text-lg leading-relaxed tracking-wide text-foreground/90 sm:text-xl">
                  {maskFirstLetters(line.text)}
                </span>
              ) : (
                <BlankBar text={line.text} />
              )
            ) : (
              <span className="block text-lg leading-relaxed text-foreground sm:text-xl">
                {line.text}
              </span>
            )}
          </button>
        ) : (
          // Partner / cue lines — always full, slightly muted.
          <p className="px-1 text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {line.text}
          </p>
        )}

        {line.stageDirection && (
          <p className="px-1 text-sm italic text-muted-foreground/80">
            [{line.stageDirection}]
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p>
        )}
      </header>

      {/* Controls */}
      <div className="space-y-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
          {MODES.map((m) => {
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={active}
                onClick={() => switchMode(m.value)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        {mode === "read" ? (
          <div className="space-y-2">
            {/* Level control */}
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
              {LEVELS.map((l) => {
                const active = level === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLevel(l.value)}
                    className={cn(
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Tap a hidden line to peek.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Build-up controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setBuiltUpTo((n) => Math.min(n + 1, lines.length))
                }
                disabled={atEnd}
                className={cn(
                  "rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors cursor-pointer hover:bg-[#B03000]",
                  atEnd && "cursor-not-allowed opacity-50 hover:bg-primary",
                )}
              >
                Add next line
              </button>
              <button
                type="button"
                onClick={startOver}
                className="rounded-md border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors cursor-pointer hover:text-foreground"
              >
                Start over
              </button>
              <span className="text-sm tabular-nums text-muted-foreground">
                {builtUpTo} / {lines.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Recall each line from the top, then add the next. Tap a blank to
              peek.
            </p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="space-y-5">
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

      {mode === "buildup" && atEnd && (
        <p className="text-sm text-muted-foreground">
          You&apos;ve built the whole piece — run it from the top.
        </p>
      )}
    </div>
  );
}

export default MemorizeView;
