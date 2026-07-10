"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconMicrophone, IconPlayerPlay, IconEye, IconRefresh, IconArrowRight } from "@tabler/icons-react";
import type { Monologue } from "@/types/actor";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { wordMatchScore, toDeliverableLines } from "@/lib/lineMatching";

/** Fraction of the line's words we need to hear before advancing. */
const MATCH_THRESHOLD = 0.7;
/** Silence (ms) on the current line before we cue it (reveal the text). */
const STALL_MS = 3000;

interface MonologueCueingProps {
  monologue: Monologue;
}

function linesFromMonologue(m: Monologue): string[] {
  const dialogue = (m.text_segments ?? [])
    .filter((s) => s.type === "dialogue")
    .map((s) => s.text)
    .join(" ")
    .trim();
  return toDeliverableLines(dialogue || m.text || "");
}

export function MonologueCueing({ monologue }: MonologueCueingProps) {
  const lines = useMemo(() => linesFromMonologue(monologue), [monologue]);

  const [started, setStarted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealCurrent, setRevealCurrent] = useState(false);

  const completed = started && activeIndex >= lines.length;

  // Move to a line and hide it (so the actor recalls it from memory).
  const goToLine = useCallback((next: number) => {
    setRevealCurrent(false);
    setActiveIndex(next);
  }, []);

  // Called by the speech hook on each finalized utterance (external system →
  // setState in a callback, which is the supported pattern — no effect needed).
  const handleHeard = useCallback(
    (heard: string) => {
      if (!started || completed) return;
      const current = lines[activeIndex];
      if (!current) return;
      if (wordMatchScore(current, heard) >= MATCH_THRESHOLD) {
        goToLine(activeIndex + 1);
      }
    },
    [started, completed, lines, activeIndex, goToLine],
  );

  const { transcript, isListening, isSupported, startListening, stopListening } =
    useSpeechRecognition({ continuous: true, interimResults: true, onResult: handleHeard });

  // Stall timer: if the current line goes quiet, cue it (reveal the text).
  // Each interim `transcript` update resets the timer, so speaking prevents it.
  useEffect(() => {
    if (!started || completed || !isListening) return;
    const t = setTimeout(() => setRevealCurrent(true), STALL_MS);
    return () => clearTimeout(t);
  }, [transcript, activeIndex, started, completed, isListening]);

  // Stop the mic once we're through.
  useEffect(() => {
    if (completed && isListening) stopListening();
  }, [completed, isListening, stopListening]);

  const begin = useCallback(() => {
    setStarted(true);
    setActiveIndex(0);
    if (isSupported) startListening();
  }, [isSupported, startListening]);

  const restart = useCallback(() => {
    setRevealCurrent(false);
    setActiveIndex(0);
    if (isSupported && !isListening) startListening();
  }, [isSupported, isListening, startListening]);

  if (lines.length === 0) {
    return <p className="text-muted-foreground">This piece has no usable text to run.</p>;
  }

  // ---- Start screen ----
  if (!started) {
    return (
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <h2 className="text-lg font-semibold">Run it off book</h2>
        <p className="text-sm text-muted-foreground">
          Say the piece out loud. I&apos;ll follow along and only show you a line if you
          get stuck. {lines.length} line{lines.length === 1 ? "" : "s"} to go.
        </p>
        {!isSupported && (
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Live listening isn&apos;t supported in this browser. You can still step through
            the lines manually (try Chrome or Edge for voice).
          </p>
        )}
        <button
          onClick={begin}
          className="inline-flex items-center gap-2 rounded-md bg-[#CB4B00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B03000]"
        >
          <IconPlayerPlay className="h-4 w-4" />
          Start
        </button>
      </div>
    );
  }

  // ---- Completed screen ----
  if (completed) {
    return (
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <h2 className="text-lg font-semibold">You made it through.</h2>
        <p className="text-sm text-muted-foreground">
          Performance notes are coming next. For now, run it again to lock it in.
        </p>
        <button
          onClick={restart}
          className="inline-flex items-center gap-2 rounded-md bg-[#CB4B00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B03000]"
        >
          <IconRefresh className="h-4 w-4" />
          Run it again
        </button>
      </div>
    );
  }

  // ---- Running: line list ----
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        {lines.map((line, i) => {
          if (i < activeIndex) {
            return (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground/60">
                {line}
              </p>
            );
          }
          if (i === activeIndex) {
            return (
              <div key={i} className="rounded-md border-l-2 border-[#CB4B00] bg-[#CB4B00]/5 px-3 py-2">
                {revealCurrent ? (
                  <p className="text-base font-medium leading-relaxed">{line}</p>
                ) : (
                  <p className="select-none text-base leading-relaxed tracking-widest text-muted-foreground">
                    {line.replace(/[^\s]/g, "•")}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {revealCurrent ? "Here it is — keep going." : "Your line. Say it, or tap Show line."}
                </p>
              </div>
            );
          }
          // Upcoming lines stay hidden.
          return (
            <p key={i} aria-hidden className="select-none text-base leading-relaxed text-transparent">
              •
            </p>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {isSupported && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
              isListening ? "bg-[#CB4B00]/10 text-[#CB4B00]" : "bg-muted text-muted-foreground"
            }`}
          >
            <IconMicrophone className="h-3.5 w-3.5" />
            {isListening ? "Listening" : "Mic paused"}
          </span>
        )}
        <button
          onClick={() => setRevealCurrent(true)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <IconEye className="h-3.5 w-3.5" />
          Show line
        </button>
        <button
          onClick={() => goToLine(activeIndex + 1)}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <IconArrowRight className="h-3.5 w-3.5" />
          Next line
        </button>
        <button
          onClick={restart}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <IconRefresh className="h-3.5 w-3.5" />
          Restart
        </button>
      </div>
    </div>
  );
}
