"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconMicrophone, IconPlayerPlay, IconEye, IconRefresh, IconArrowRight } from "@tabler/icons-react";
import type { Monologue } from "@/types/actor";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { wordMatchScore, toDeliverableLines } from "@/lib/lineMatching";
import api from "@/lib/api";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";

/** Fraction of the line's words we need to hear before advancing. */
const MATCH_THRESHOLD = 0.7;
/** Silence (ms) on the current line before we cue it (reveal the text). */
const STALL_MS = 3000;

interface DeliveryFeedback {
  rating: number;
  overall_notes: string;
  line_accuracy?: string | null;
  pacing?: string | null;
  emotional_tone?: string | null;
  tips?: string[] | null;
}

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
  const [notes, setNotes] = useState<DeliveryFeedback | null>(null);
  const [notesStatus, setNotesStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [paywallOpen, setPaywallOpen] = useState(false);

  const completed = started && activeIndex >= lines.length;

  // Everything the actor said this run (for the delivery notes), plus timing.
  const heardRef = useRef<string[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const fetchedRef = useRef(false);

  const runAnalysis = useCallback(async () => {
    setNotesStatus("loading");
    try {
      const duration = startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : undefined;
      const res = await api.post<DeliveryFeedback>("/api/monologue-work/analyze", {
        monologue_id: monologue.id,
        transcript: heardRef.current.join(" "),
        duration_seconds: duration,
      });
      setNotes(res.data);
      setNotesStatus("done");
    } catch {
      setNotesStatus("error");
    }
  }, [monologue.id]);

  // Move to a line and hide it. When we advance past the last line the run is
  // done, so kick off the delivery notes here (an event handler, not an effect).
  const goToLine = useCallback(
    (next: number) => {
      setRevealCurrent(false);
      setActiveIndex(next);
      if (next >= lines.length && !fetchedRef.current) {
        fetchedRef.current = true;
        void runAnalysis();
      }
    },
    [lines.length, runAnalysis],
  );

  // Called by the speech hook on each finalized utterance (external system →
  // setState in a callback, which is the supported pattern — no effect needed).
  const handleHeard = useCallback(
    (heard: string) => {
      if (!started || completed) return;
      heardRef.current.push(heard);
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

  const resetRun = useCallback(() => {
    heardRef.current = [];
    startTimeRef.current = Date.now();
    fetchedRef.current = false;
    setNotes(null);
    setNotesStatus("idle");
    setRevealCurrent(false);
    setActiveIndex(0);
  }, []);

  const begin = useCallback(async () => {
    // Meter the session; a 403 means the free cap is hit → show the paywall.
    try {
      await api.post("/api/monologue-work/start", { monologue_id: monologue.id });
    } catch (error) {
      const code = (error as Error & { response?: { status?: number } })?.response?.status;
      if (code === 403) {
        setPaywallOpen(true);
        return;
      }
      // Non-limit errors (network/metering hiccup): fail open, let them rehearse.
    }
    resetRun();
    setStarted(true);
    if (isSupported) startListening();
  }, [monologue.id, resetRun, isSupported, startListening]);

  const restart = useCallback(() => {
    resetRun();
    if (isSupported && !isListening) startListening();
  }, [resetRun, isSupported, isListening, startListening]);

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
          onClick={() => void begin()}
          className="inline-flex items-center gap-2 rounded-md bg-[#CB4B00] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B03000]"
        >
          <IconPlayerPlay className="h-4 w-4" />
          Start
        </button>
        <MonologuePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
      </div>
    );
  }

  // ---- Completed screen ----
  if (completed) {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <h2 className="text-lg font-semibold">You made it through.</h2>

        {notesStatus === "loading" && (
          <p className="text-sm text-muted-foreground">Getting your notes…</p>
        )}
        {notesStatus === "error" && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load your notes.</p>
            <button onClick={runAnalysis} className="text-sm text-[#CB4B00] hover:underline">
              Try again
            </button>
          </div>
        )}
        {notesStatus === "done" && notes && (
          <div className="flex w-full flex-col gap-3 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Your notes</span>
              {notes.rating > 0 && (
                <span className="text-sm text-muted-foreground">{notes.rating} / 5</span>
              )}
            </div>
            <p className="text-sm leading-relaxed">{notes.overall_notes}</p>
            {notes.line_accuracy && <NoteRow label="Line accuracy" value={notes.line_accuracy} />}
            {notes.pacing && <NoteRow label="Pacing" value={notes.pacing} />}
            {notes.emotional_tone && <NoteRow label="Emotional tone" value={notes.emotional_tone} />}
            {notes.tips && notes.tips.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Try next
                </p>
                <ul className="flex flex-col gap-1">
                  {notes.tips.map((tip, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-[#CB4B00]">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm leading-relaxed">{value}</p>
    </div>
  );
}
