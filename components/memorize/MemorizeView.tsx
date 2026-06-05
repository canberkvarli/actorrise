"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { maskFirstLetters } from "@/lib/memorize";

type Level = "full" | "hints" | "blank";

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
  const [level, setLevel] = useState<Level>("full");
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const toggleReveal = (index: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
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

      {/* Level control */}
      <div className="space-y-2">
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
        <p className="text-xs text-muted-foreground">Tap a hidden line to peek.</p>
      </div>

      {/* Lines */}
      <div className="space-y-5">
        {lines.map((line, i) => {
          const prev = lines[i - 1];
          const showSpeaker =
            line.speaker != null &&
            (i === 0 || prev?.speaker !== line.speaker);

          const isPeeked = revealed.has(i);
          const masked = line.mine && level !== "full" && !isPeeked;

          return (
            <div key={i} className="space-y-1.5">
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
                  {masked ? (
                    level === "hints" ? (
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
        })}
      </div>
    </div>
  );
}

export default MemorizeView;
