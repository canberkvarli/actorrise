"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconPlayerPlayFilled,
  IconEye,
  IconRefresh,
  IconArrowLeft,
} from "@tabler/icons-react";
import type { Monologue } from "@/types/actor";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToggleFavorite } from "@/hooks/useBookmarks";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { useAuth } from "@/lib/auth";
import { wordMatchScore, toDeliverableLines, spokenPrefixCount } from "@/lib/lineMatching";
import api from "@/lib/api";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
import { MicWaveform } from "@/components/scenepartner/MicWaveform";
import { GhostLight } from "@/components/brand/GhostLight";

/** Fraction of the line's words we need to hear before advancing. */
const MATCH_THRESHOLD = 0.7;
/** Silence (ms) on the current line before we cue it (reveal the text). */
const STALL_MS = 3000;

const SERIF = "var(--font-sans), Georgia, 'Times New Roman', serif";
/** Typewriter face — reserved for the monologue TEXT itself (never titles/UI). */
const SCRIPT = "var(--font-typewriter), 'Courier Prime', 'Courier New', monospace";

/** Auto-scale a line's font to its length so long lines fit and the dock stays visible. */
function lineFontSize(len: number): string {
  if (len > 170) return "clamp(0.95rem, 2.1vw, 1.4rem)";
  if (len > 110) return "clamp(1.1rem, 2.7vw, 1.75rem)";
  if (len > 60) return "clamp(1.3rem, 3.3vw, 2.1rem)";
  return "clamp(1.55rem, 4.2vw, 2.7rem)";
}

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
  onExit?: () => void;
}

function linesFromMonologue(m: Monologue): string[] {
  const dialogue = (m.text_segments ?? [])
    .filter((s) => s.type === "dialogue")
    .map((s) => s.text)
    .join(" ")
    .trim();
  return toDeliverableLines(dialogue || m.text || "");
}

export function MonologueCueing({ monologue, onExit }: MonologueCueingProps) {
  const lines = useMemo(() => linesFromMonologue(monologue), [monologue]);

  const [started, setStarted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealCurrent, setRevealCurrent] = useState(false);
  const [offBook, setOffBook] = useState(false);
  const [notes, setNotes] = useState<DeliveryFeedback | null>(null);
  const [notesStatus, setNotesStatus] = useState<"idle" | "loading" | "done" | "error" | "skipped">("idle");
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Save/bookmark from inside the rehearsal. Optimistic local state gives instant
  // feedback; the hook handles the API call, undo toast, and cache updates.
  const toggleFav = useToggleFavorite();
  const [favorited, setFavorited] = useState(!!monologue.is_favorited);
  const onToggleFav = useCallback(() => {
    const current = favorited;
    setFavorited(!current);
    toggleFav.mutate(
      { monologueId: monologue.id, isFavorited: current },
      {
        onError: (err) => {
          // Rapid-toggle guard throws "__skip__" — not a real failure, don't revert.
          if (err instanceof Error && err.message === "__skip__") return;
          setFavorited(current);
        },
      },
    );
  }, [favorited, monologue.id, toggleFav]);

  // Reverse trial: show how many days of unlimited access are left, so the
  // window feels real and worth using before it lapses to the free cap.
  const { user } = useAuth();
  const trialEnd = user?.monologue_trial_ends_at ? new Date(user.monologue_trial_ends_at) : null;
  const trialDaysLeft = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000)
    : 0;
  const inTrial = trialDaysLeft > 0;

  const completed = started && activeIndex >= lines.length;

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

  const goToLine = useCallback(
    (next: number) => {
      setRevealCurrent(false);
      setActiveIndex(next);
      if (next >= lines.length && !fetchedRef.current) {
        fetchedRef.current = true;
        // Only ask the coach for notes if we actually heard the actor. On phones
        // (no speech API) or a dead mic there's no transcript, so skip the call
        // and show a clean curtain instead of the "I didn't catch anything" message.
        if (heardRef.current.length > 0) {
          void runAnalysis();
        } else {
          setNotesStatus("skipped");
        }
      }
    },
    [lines.length, runAnalysis],
  );

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

  const { transcript, isListening, isSupported, startListening, stopListening, resetTranscript } =
    useSpeechRecognition({ continuous: true, interimResults: true, onResult: handleHeard });

  // No Web Speech API (iOS Safari, most phones) → run as a tap-to-advance
  // teleprompter instead of silently failing. Voice-follow is a bonus, not a
  // requirement, so the whole feature works on every device.
  const tapToAdvance = !isSupported;

  // Reset the live transcript when we move to a new line so highlighting is fresh.
  const goToLineAndReset = useCallback(
    (next: number) => {
      resetTranscript();
      goToLine(next);
    },
    [resetTranscript, goToLine],
  );

  // Stall timer: quiet on the current line → cue it (reveal the text).
  useEffect(() => {
    if (!started || completed || !isListening) return;
    const t = setTimeout(() => setRevealCurrent(true), STALL_MS);
    return () => clearTimeout(t);
  }, [transcript, activeIndex, started, completed, isListening]);

  useEffect(() => {
    if (completed && isListening) stopListening();
  }, [completed, isListening, stopListening]);

  const resetRun = useCallback(() => {
    heardRef.current = [];
    startTimeRef.current = Date.now();
    fetchedRef.current = false;
    resetTranscript();
    setNotes(null);
    setNotesStatus("idle");
    setRevealCurrent(false);
    setActiveIndex(0);
  }, [resetTranscript]);

  const begin = useCallback(async () => {
    try {
      await api.post("/api/monologue-work/start", { monologue_id: monologue.id });
    } catch (error) {
      const code = (error as Error & { response?: { status?: number } })?.response?.status;
      if (code === 403) {
        setPaywallOpen(true);
        return;
      }
    }
    resetRun();
    setStarted(true);
    if (isSupported) startListening();
  }, [monologue.id, resetRun, isSupported, startListening]);

  const restart = useCallback(() => {
    resetRun();
    if (isSupported && !isListening) startListening();
  }, [resetRun, isSupported, isListening, startListening]);

  // Live per-word progress for the current line.
  const currentLine = lines[activeIndex] ?? "";
  const currentWords = useMemo(() => currentLine.split(/\s+/).filter(Boolean), [currentLine]);
  const spokenCount = spokenPrefixCount(currentLine, transcript);

  if (lines.length === 0) {
    return <p className="text-white/50" style={{ fontFamily: SERIF }}>This piece has no usable text to run.</p>;
  }

  return (
    <div className="stage-grain relative flex h-full w-full flex-col overflow-hidden bg-[var(--stage)] text-[var(--stage-fg)]">
      {/* Ambient stage — the landing's own vocabulary: warm overhead wash, then a
          soft shadow pooling at the foot so the stage never reads as flat black. */}
      <div aria-hidden className="stage-wash pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--stage-deep) 55%, transparent) 0%, transparent 30%, transparent 68%, color-mix(in oklab, black 45%, transparent) 100%)",
        }}
      />

      {/* Top bar — playbill */}
      <header className="relative z-10 flex items-center gap-3 px-5 pt-5">
        <button
          onClick={onExit}
          aria-label="Leave"
          className="text-white/40 transition-colors hover:text-white/80"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-tight text-white sm:text-3xl" style={{ fontFamily: SERIF }}>
            {monologue.character_name}
          </h1>
          <p className="truncate text-sm text-white/55">{monologue.title}</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {started && !completed && (
            <span className="text-[0.7rem] uppercase tracking-[0.22em] text-white/45">
              {Math.min(activeIndex + 1, lines.length)} / {lines.length}
            </span>
          )}
          <button
            onClick={onToggleFav}
            aria-label={favorited ? "Remove from saved" : "Save this monologue"}
            aria-pressed={favorited}
            className={`transition-colors ${favorited ? "text-[#CB4B00]" : "text-white/40 hover:text-white/80"}`}
          >
            <BookmarkIcon filled={favorited} size="md" />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ---------- Start ---------- */}
        {!started && (
          <motion.div
            key="start"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center"
          >
            <div className="flex flex-col items-center gap-4">
              <GhostLight size="md" className="mb-1" />
              <span className="text-xs uppercase tracking-[0.3em] text-[#CB4B00]">Off book</span>
              <p className="max-w-md text-2xl font-medium leading-snug text-white">
                {tapToAdvance
                  ? "Run it at your own pace. Tap to move through it."
                  : "Say it out loud. I’ll follow along."}
              </p>
              <p className="text-sm text-white/45">
                {lines.length} line{lines.length === 1 ? "" : "s"}
                {tapToAdvance && " · tap anywhere to advance"}
              </p>
              {inTrial && (
                <p className="text-xs uppercase tracking-[0.2em] text-[#CB4B00]/85">
                  {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} of full access left
                </p>
              )}
            </div>

            <button
              onClick={() => void begin()}
              className="group inline-flex items-center gap-2.5 rounded-full bg-[#CB4B00] px-8 py-3.5 text-sm font-semibold tracking-wide text-white shadow-[0_0_40px_-8px_rgba(203,75,0,0.7)] transition-all hover:bg-[#B03000] hover:shadow-[0_0_55px_-6px_rgba(203,75,0,0.85)]"
            >
              <IconPlayerPlayFilled className="h-4 w-4" />
              Begin
            </button>

            <button
              onClick={() => setOffBook((v) => !v)}
              className={`text-xs uppercase tracking-[0.18em] transition-colors ${offBook ? "text-[#CB4B00]" : "text-white/35 hover:text-white/60"}`}
            >
              {offBook ? "Hidden-line mode: on" : "Hide the lines (harder)"}
            </button>

            <MonologuePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
          </motion.div>
        )}

        {/* ---------- Completed ---------- */}
        {completed && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10 text-center"
          >
            <span className="text-[0.68rem] uppercase tracking-[0.3em] text-[#CB4B00]">Curtain</span>
            <h2 className="text-3xl text-white/90" style={{ fontFamily: SERIF }}>
              You made it through.
            </h2>

            {notesStatus === "loading" && (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#CB4B00]" />
                Reading your performance…
              </div>
            )}
            {notesStatus === "error" && (
              <button onClick={runAnalysis} className="text-sm text-[#CB4B00] hover:underline">
                Notes didn&apos;t load — try again
              </button>
            )}
            {notesStatus === "skipped" && (
              <p className="max-w-xs text-sm leading-relaxed text-white/45">
                That&apos;s a full run. When you rehearse out loud on a voice-enabled browser, I&apos;ll
                give you director&apos;s notes on your delivery too.
              </p>
            )}
            {notesStatus === "done" && notes && (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                className="flex w-full max-w-md flex-col gap-4 text-left"
              >
                <Reveal>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-[0.68rem] uppercase tracking-[0.22em] text-white/40">
                      Director&apos;s notes
                    </span>
                    {notes.rating > 0 && <Stars rating={notes.rating} />}
                  </div>
                </Reveal>
                <Reveal>
                  <p className="text-base leading-relaxed text-white/85" style={{ fontFamily: SERIF }}>
                    {notes.overall_notes}
                  </p>
                </Reveal>
                {notes.line_accuracy && <NoteRow label="Line accuracy" value={notes.line_accuracy} />}
                {notes.pacing && <NoteRow label="Pacing" value={notes.pacing} />}
                {notes.emotional_tone && <NoteRow label="Emotional tone" value={notes.emotional_tone} />}
                {notes.tips && notes.tips.length > 0 && (
                  <Reveal>
                    <div className="pt-1">
                      <p className="mb-2 text-[0.68rem] uppercase tracking-[0.22em] text-white/40">Try next</p>
                      <ul className="flex flex-col gap-2">
                        {notes.tips.map((tip, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-white/70">
                            <span className="text-[#CB4B00]">—</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Reveal>
                )}
              </motion.div>
            )}

            <button
              onClick={restart}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:border-[#CB4B00] hover:text-white"
            >
              <IconRefresh className="h-4 w-4" />
              Run it again
            </button>
          </motion.div>
        )}

        {/* ---------- Running (the stage) ---------- */}
        {started && !completed && (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-8"
          >
            <div
              role={tapToAdvance ? "button" : undefined}
              tabIndex={tapToAdvance ? 0 : undefined}
              aria-label={tapToAdvance ? "Tap to advance to the next line" : undefined}
              onClick={tapToAdvance ? () => goToLineAndReset(activeIndex + 1) : undefined}
              onKeyDown={
                tapToAdvance
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goToLineAndReset(activeIndex + 1);
                      }
                    }
                  : undefined
              }
              className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-2${tapToAdvance ? " cursor-pointer select-none" : ""}`}
            >
              {/* delivered line, receding */}
              <div className="flex min-h-[2rem] items-end justify-center">
                {activeIndex > 0 && (
                  <p
                    className="max-w-2xl text-center text-sm leading-relaxed text-white/30"
                    style={{ fontFamily: SCRIPT }}
                  >
                    {lines[activeIndex - 1]}
                  </p>
                )}
              </div>

              {/* current line — spotlit, word-by-word, font auto-scaled to length */}
              <div className="relative flex max-w-3xl items-center justify-center py-2">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 blur-3xl"
                  style={{ background: "radial-gradient(60% 55% at 50% 50%, rgba(203,75,0,0.18), transparent 70%)" }}
                />
                <AnimatePresence mode="wait">
                  <motion.p
                    key={activeIndex}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    className="text-center leading-[1.4]"
                    style={{ fontFamily: SCRIPT, fontSize: lineFontSize(currentLine.length) }}
                  >
                    {currentWords.map((word, i) => {
                      const spoken = i < spokenCount;
                      const masked = offBook && !revealCurrent && !spoken;
                      return (
                        <span
                          key={i}
                          className="transition-all duration-300"
                          style={{
                            color: spoken ? "#FF9147" : masked ? "transparent" : "rgba(246,240,229,0.94)",
                            textShadow: spoken ? "0 0 26px rgba(255,130,50,0.5)" : "none",
                          }}
                        >
                          {masked ? (
                            <span className="text-white/15">{"•".repeat(Math.max(2, word.replace(/[^\p{L}\p{N}]/gu, "").length))}</span>
                          ) : (
                            word
                          )}{" "}
                        </span>
                      );
                    })}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* upcoming line, veiled */}
              <div className="flex min-h-[2rem] items-start justify-center">
                {activeIndex + 1 < lines.length && (
                  <p
                    className="max-w-2xl text-center text-sm leading-relaxed text-white/20"
                    style={{ fontFamily: SCRIPT }}
                  >
                    {offBook ? "" : lines[activeIndex + 1]}
                  </p>
                )}
              </div>
            </div>

            {/* control dock — just under the line */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <MicPulse active={isListening} supported={isSupported} tap={tapToAdvance} />
              {offBook && (
                <button
                  onClick={() => setRevealCurrent(true)}
                  className="flex min-h-[40px] items-center gap-1.5 px-2 text-xs uppercase tracking-[0.16em] text-white/45 transition-colors hover:text-white/80"
                >
                  <IconEye className="h-4 w-4" /> Line
                </button>
              )}
              {!tapToAdvance && (
                <button
                  onClick={() => goToLineAndReset(activeIndex + 1)}
                  className="min-h-[40px] px-2 text-xs uppercase tracking-[0.16em] text-white/45 transition-colors hover:text-white/80"
                >
                  Skip
                </button>
              )}
              <button
                onClick={restart}
                className="min-h-[40px] px-2 text-xs uppercase tracking-[0.16em] text-white/45 transition-colors hover:text-white/80"
              >
                Restart
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MicPulse({ active, supported, tap }: { active: boolean; supported: boolean; tap?: boolean }) {
  if (tap) {
    return (
      <span className="text-xs uppercase tracking-[0.16em] text-white/40">Tap the text to advance</span>
    );
  }
  if (!supported) {
    return <span className="text-xs uppercase tracking-[0.16em] text-white/30">no mic</span>;
  }
  return (
    <span className="flex items-center gap-2.5 text-xs uppercase tracking-[0.16em] text-white/50">
      <MicWaveform active={active} className="w-16" />
      {active ? "Listening" : "Paused"}
    </span>
  );
}

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
      {children}
    </motion.div>
  );
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <Reveal>
      <div>
        <p className="mb-1 text-[0.68rem] uppercase tracking-[0.22em] text-white/40">{label}</p>
        <p className="text-sm leading-relaxed text-white/70">{value}</p>
      </div>
    </Reveal>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? "text-[#CB4B00]" : "text-white/15"}>
          ★
        </span>
      ))}
    </span>
  );
}
