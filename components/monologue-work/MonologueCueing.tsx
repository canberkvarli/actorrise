"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconPlayerPlayFilled,
  IconRefresh,
  IconArrowLeft,
  IconBulb,
  IconBulbFilled,
} from "@tabler/icons-react";
import type { Monologue } from "@/types/actor";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useToggleFavorite } from "@/hooks/useBookmarks";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { useAuth } from "@/lib/auth";
import { wordMatchScore, toDeliverableLines, spokenPrefixCount } from "@/lib/lineMatching";
import {
  trackRehearsalStarted,
  trackRehearsalLineDelivered,
  trackRehearsalCompleted,
  trackRehearsalAbandoned,
} from "@/lib/analytics";
import api from "@/lib/api";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
import { useTrialOffer, TrialOfferCard } from "@/components/billing/TrialOffer";
import {
  GhostLightSketch,
  MicSketch,
  ScriptPagesSketch,
} from "@/components/brand/sketches";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { displayableAuthor } from "@/lib/utils";
import { MicWaveform } from "@/components/scenepartner/MicWaveform";

/** How far through the line (in order) you must read before it advances — high
 *  enough that it won't jump mid-sentence, low enough that a dropped word or two
 *  on a long line doesn't strand you. */
const MATCH_THRESHOLD = 0.85;
/** Silence (ms) on the current line before we cue it (reveal the text). */
const STALL_MS = 3000;

/** Typewriter face — reserved for the monologue TEXT itself (never titles/UI). */
const SCRIPT = "var(--font-typewriter), 'Courier Prime', 'Courier New', monospace";

/** Auto-scale a line's font to its length so long lines fit and the dock stays visible. */
function lineFontSize(len: number): string {
  if (len > 170) return "clamp(0.95rem, 2.1vw, 1.4rem)";
  if (len > 110) return "clamp(1.1rem, 2.7vw, 1.75rem)";
  if (len > 60) return "clamp(1.3rem, 3.3vw, 2.1rem)";
  return "clamp(1.55rem, 4.2vw, 2.7rem)";
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

  /**
   * The off-book mark, claimable from the curtain call. Same pair of calls the
   * detail page makes — the flag plus the studied ping that drives the spaced
   * review clock. Named `markedOffBook` to stay clear of `offBook` above, which
   * is the hide-the-lines display mode and an unrelated thing entirely.
   */
  const toggleMemorized = useToggleMemorized();
  const [markedOffBook, setMarkedOffBook] = useState(!!monologue.memorized);
  const markOffBook = useCallback(() => {
    if (markedOffBook) return;
    setMarkedOffBook(true);
    toggleMemorized.mutate({ monologueId: monologue.id, memorized: true });
    api.post(`/api/monologues/${monologue.id}/studied`, {}).catch(() => {});
  }, [markedOffBook, monologue.id, toggleMemorized]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  /* ── Analytics ─────────────────────────────────────────────────── */
  // Same four events as the scene run screen, so scene / monologue / greenroom
  // are comparable in one report rather than three incompatible funnels.
  const startedAtRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const firstLineRef = useRef(false);

  useEffect(() => {
    if (!started || startedAtRef.current !== null) return;
    startedAtRef.current = Date.now();
    trackRehearsalStarted({ mode: "monologue", scene_id: monologue.id });
  }, [started, monologue.id]);

  useEffect(() => {
    if (!completed || completedRef.current) return;
    completedRef.current = true;
    trackRehearsalCompleted({
      mode: "monologue",
      duration_seconds: Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000),
      lines_total: lines.length,
    });
  }, [completed, lines.length]);

  // Advancing past line 0 means they actually spoke it (or tapped through it).
  useEffect(() => {
    if (!started || firstLineRef.current || activeIndex < 1) return;
    firstLineRef.current = true;
    trackRehearsalLineDelivered({
      mode: "monologue",
      seconds_to_first_line: Math.floor(
        (Date.now() - (startedAtRef.current ?? Date.now())) / 1000,
      ),
    });
  }, [started, activeIndex]);

  // Left mid-piece. Reads refs only, since this runs on unmount when no further
  // render will ever happen.
  // The ask, on the surface people actually use. In the 14 days to 2026-08-13,
  // 12 of 52 searchers rehearsed a monologue against 4 who entered a scene, and
  // the 2-run monologue cap is the most-hit wall in the product. The offer had
  // been built only onto the scene page, which is the smaller audience.
  const monologueOffer = useTrialOffer("monologue_completed", completed);

  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const linesLengthRef = useRef(lines.length);
  linesLengthRef.current = lines.length;

  useEffect(() => {
    return () => {
      if (startedAtRef.current === null || completedRef.current) return;
      const total = linesLengthRef.current;
      trackRehearsalAbandoned({
        mode: "monologue",
        progress_pct: total > 0 ? Math.round((activeIndexRef.current / total) * 100) : 0,
        last_line_index: activeIndexRef.current,
        duration_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
      });
    };
  }, []);

  const goToLine = useCallback((next: number) => {
    setRevealCurrent(false);
    setActiveIndex(next);
  }, []);

  const {
    transcript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition({ continuous: true, interimResults: true });

  /**
   * The support check is not enough on its own, and this was the whole mobile
   * problem: iOS Safari HAS webkitSpeechRecognition, so `isSupported` is true and
   * we committed to voice mode — then `start()` failed at runtime and the error
   * went nowhere, because this component never read `error` off the hook. You got
   * a stage that said "Listening" while nothing advanced, forever. Mobile reached
   * a spoken line 30% of the time against desktop's 64%.
   *
   * 'no-speech' fires on any quiet stretch and 'aborted' is our own unmount
   * cleanup — neither means a broken mic. Anything else does.
   */
  const micBroke =
    !!speechError && speechError !== "no-speech" && speechError !== "aborted";

  // Latch it. `startListening` clears `error`, so without this the UI would flap
  // between voice and tap mode instead of settling.
  const [micDead, setMicDead] = useState(false);
  useEffect(() => {
    if (micBroke) setMicDead(true);
  }, [micBroke]);

  /** Set when the re-listen budget below runs out — the mic never errored, it
   *  just refused to stay on. Same outcome for the actor, so same fallback. */
  const [listenExhausted, setListenExhausted] = useState(false);

  // No Web Speech API at all, or it died on us → run as a tap-to-advance
  // teleprompter instead of silently failing. Voice-follow is a bonus, not a
  // requirement, so the whole feature works on every device.
  const tapToAdvance = !isSupported || micDead || listenExhausted;

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

  // Advance once you've read most of the current line, measured against the
  // cumulative transcript (so a mid-line pause never loses progress). Two paths
  // so a missed word doesn't strand you: the in-order highlight reached ~the end
  // (tolerant of dropped words via lookahead), OR nearly every word was heard.
  useEffect(() => {
    if (!started || completed || tapToAdvance) return;
    const current = lines[activeIndex];
    if (!current) return;
    const wordCount = current.split(/\s+/).filter(Boolean).length;
    if (wordCount === 0) return;
    const inOrder = spokenPrefixCount(current, transcript, 4);
    if (inOrder >= wordCount * MATCH_THRESHOLD || wordMatchScore(current, transcript) >= 0.9) {
      goToLineAndReset(activeIndex + 1);
    }
  }, [transcript, activeIndex, started, completed, tapToAdvance, lines, goToLineAndReset]);

  // Keep the active line centered as the spotlight moves down the piece.
  useEffect(() => {
    if (!started || completed) return;
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex, started, completed]);

  useEffect(() => {
    if (completed && isListening) stopListening();
  }, [completed, isListening, stopListening]);

  /**
   * The other way a run silently stalls. Chrome ends a "continuous" session on
   * its own after a stretch of silence — which is most of a monologue, since you
   * pause between beats. `onend` flips isListening false, the dock reads "Paused"
   * and nothing ever starts it again. Pick the mic back up while the run is live.
   *
   * Budgeted so a mic that refuses to start can't spin here forever; past the
   * budget we fall through to tap mode rather than pretending to listen.
   */
  const restartsRef = useRef(0);
  /** CONSECUTIVE restarts with nothing heard in between. Small on purpose: a
   *  working mic resets it below the moment any words arrive, so only a mic that
   *  is genuinely dead burns through it — in about three seconds rather than
   *  leaving you staring at "Paused". */
  const RESTART_BUDGET = 8;

  // Any speech at all proves the mic works, so forgive the count. Otherwise a
  // long piece with several quiet beats would slowly exhaust the budget and
  // drop a perfectly good voice run into tap mode near the end.
  useEffect(() => {
    if (transcript.trim()) restartsRef.current = 0;
  }, [transcript]);

  useEffect(() => {
    if (!started || completed || tapToAdvance || isListening || listenExhausted) return;
    if (restartsRef.current >= RESTART_BUDGET) {
      setListenExhausted(true);
      return;
    }
    const t = setTimeout(() => {
      restartsRef.current += 1;
      startListening();
    }, 400);
    return () => clearTimeout(t);
  }, [started, completed, tapToAdvance, isListening, listenExhausted, startListening]);

  const resetRun = useCallback(() => {
    resetTranscript();
    setRevealCurrent(false);
    setActiveIndex(0);
    restartsRef.current = 0;
    setListenExhausted(false);
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
    return <p className="font-sans text-[var(--stage-fg)]/50">This piece has no usable text to run.</p>;
  }

  return (
    /* `dark` so the theme tokens resolve to their dark values on this always-dark
       surface — the stage was painting itself with hardcoded #CB4B00 instead of
       the brightened orange the rest of the dark shell uses. Same move the
       landing header makes. */
    <div className="dark stage-grain relative flex h-full w-full flex-col overflow-hidden bg-[var(--stage)] text-[var(--stage-fg)]">
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
      {/* Everything on this screen sits in one column so the title, the piece and
          the dock share an edge. They used to be pinned to opposite sides of the
          viewport with the text stranded in the middle. */}
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center gap-3 px-5 pt-4">
        <button
          onClick={onExit}
          aria-label="Leave"
          className="text-[var(--stage-fg)]/40 transition-colors hover:text-[var(--stage-fg)]/80"
        >
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-brand text-2xl font-medium leading-tight text-[var(--stage-fg)] sm:text-3xl">
            {monologue.character_name}
          </h1>
          <p className="truncate text-sm text-[var(--stage-fg)]/55">{monologue.title}</p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {started && !completed && (
            <span className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--stage-fg)]/45">
              {Math.min(activeIndex + 1, lines.length)} / {lines.length}
            </span>
          )}
          <button
            onClick={onToggleFav}
            aria-label={favorited ? "Remove from saved" : "Save this monologue"}
            aria-pressed={favorited}
            className={`transition-colors ${favorited ? "text-primary" : "text-[var(--stage-fg)]/40 hover:text-[var(--stage-fg)]/80"}`}
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
              {/* The drawing states the mode: a mic when I'm listening, pages
                  when you're driving it yourself. This was a bare orange dot —
                  the same glyph as the page's loading indicator, so the screen
                  you land on looked like a screen still loading. */}
              {tapToAdvance ? (
                <ScriptPagesSketch size={64} className="text-[var(--stage-fg)]/55" />
              ) : (
                <MicSketch size={64} className="text-[var(--stage-fg)]/55" />
              )}
              {/* Was "Off book", which fought the hide-the-lines control below —
                  two different meanings of off-book on one screen. Say where we
                  are instead. */}
              <span className="stage-direction text-xs text-[var(--stage-fg)]/45">(places.)</span>
              <p className="max-w-md text-2xl font-medium leading-snug text-[var(--stage-fg)]">
                {tapToAdvance
                  ? "Run it at your own pace. Tap to move through it."
                  : "Say it out loud. I’ll follow along."}
              </p>
              <p className="text-sm text-[var(--stage-fg)]/45">
                {monologue.play_title}
                {displayableAuthor(monologue.author) ? ` · ${displayableAuthor(monologue.author)}` : ""}
              </p>
              <p className="text-xs text-[var(--stage-fg)]/35">
                {lines.length} line{lines.length === 1 ? "" : "s"}
                {monologue.estimated_duration_seconds
                  ? ` · about ${Math.max(1, Math.round(monologue.estimated_duration_seconds / 60))} min`
                  : ""}
                {tapToAdvance && " · tap anywhere to advance"}
              </p>
              {inTrial && (
                <p className="text-xs uppercase tracking-[0.2em] text-primary/85">
                  {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} of full access left
                </p>
              )}
            </div>

            <button
              onClick={() => void begin()}
              className="group inline-flex items-center gap-2.5 rounded-full bg-primary px-8 py-3.5 text-sm font-semibold tracking-wide text-primary-foreground shadow-[0_0_40px_-8px_rgba(203,75,0,0.7)] transition-all hover:bg-primary/90 hover:shadow-[0_0_55px_-6px_rgba(203,75,0,0.85)]"
            >
              <IconPlayerPlayFilled className="h-4 w-4" />
              Begin
            </button>

            {/* The only choice on this screen, so it should look like one. It
                was a tiny all-caps line that read as a footnote. */}
            <button
              onClick={() => setOffBook((v) => !v)}
              aria-pressed={offBook}
              className={`rounded-full border px-4 py-2 text-xs transition-colors ${
                offBook
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[var(--stage-fg)]/15 text-[var(--stage-fg)]/50 hover:border-[var(--stage-fg)]/35 hover:text-[var(--stage-fg)]/80"
              }`}
            >
              {offBook ? "Lines hidden — tap to show them" : "Hide the lines · harder"}
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
            <GhostLightSketch size={56} className="text-[var(--stage-fg)]/40" />
            <span className="text-[0.68rem] uppercase tracking-[0.3em] text-primary">Curtain</span>
            <h2 className="font-brand text-3xl font-medium text-[var(--stage-fg)]/90">You made it through.</h2>
            <p className="max-w-xs text-sm leading-relaxed text-[var(--stage-fg)]/45">
              Run it again, or take it into the room.
            </p>

            {/* This screen used to offer one action — restart — so finishing a
                run was a dead end. The moment you get through a piece is the
                moment to claim it, so the off-book mark lives here too. */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--stage-fg)]/15 px-6 py-3 text-sm font-medium text-[var(--stage-fg)]/80 transition-colors hover:border-primary hover:text-[var(--stage-fg)]"
              >
                <IconRefresh className="h-4 w-4" />
                Run it again
              </button>
              <button
                onClick={markOffBook}
                disabled={markedOffBook}
                className={`inline-flex items-center gap-2 rounded-full border px-6 py-3 text-sm font-medium transition-colors ${
                  markedOffBook
                    ? "border-amber-400/40 text-amber-300"
                    : "border-[var(--stage-fg)]/15 text-[var(--stage-fg)]/80 hover:border-amber-400/60 hover:text-[var(--stage-fg)]"
                }`}
              >
                {markedOffBook ? (
                  <IconBulbFilled className="h-4 w-4" />
                ) : (
                  <IconBulb className="h-4 w-4" />
                )}
                {markedOffBook ? "Marked off book" : "I'm off book"}
              </button>
            </div>
            {onExit && (
              <button
                onClick={onExit}
                className="text-sm text-[var(--stage-fg)]/40 underline-offset-4 transition-colors hover:text-[var(--stage-fg)]/70 hover:underline"
              >
                Back to the piece
              </button>
            )}

            {monologueOffer.visible && (
              <div className="w-full max-w-sm">
                <TrialOfferCard
                  headline="Keep the stage."
                  // Deliberately no number: the free cap has moved twice in a week
                  // and copy that names it goes stale silently.
                  body="Free runs are capped. Plus takes the cap off and lets you bring your own sides in to rehearse the same way."
                  href={monologueOffer.href}
                  onAccept={monologueOffer.accept}
                  onDismiss={monologueOffer.dismiss}
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ---------- Running (the continuous stage) ---------- */}
        {started && !completed && (
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative z-10 mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col overflow-hidden px-5 pb-4"
          >
            {/* Listening indicator, top-center — the live waveform reacts to your
                voice so you can see you're being heard while you run the piece. */}
            <div className="flex items-center justify-center gap-2 pt-1 pb-2">
              {tapToAdvance ? (
                <span className="pointer-events-none flex select-none items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--stage-fg)]/45">
                  <StatusDot state="tap" />
                  {/* If the mic dropped out mid-run, say so. Switching the rules
                      of the screen without a word is how the old silent failure
                      read as the app being broken. */}
                  {micDead || listenExhausted ? "Mic dropped · tap to advance" : "Tap to advance"}
                </span>
              ) : (
                <span className="pointer-events-none flex select-none items-center gap-2.5 text-[0.7rem] uppercase tracking-[0.18em] text-[var(--stage-fg)]/55">
                  <MicWaveform active={isListening} className="w-24" />
                  {isListening ? "Listening" : "Paused"}
                </span>
              )}
            </div>

            {/* The whole piece flows here. A spotlight rides the active line, the
                lines behind recede, the ones ahead wait quietly. It auto-scrolls
                so you never wait for a line to "come in". */}
            <div
              ref={scrollRef}
              role={tapToAdvance ? "button" : undefined}
              tabIndex={tapToAdvance ? 0 : undefined}
              aria-label={tapToAdvance ? "Tap to advance" : undefined}
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
              className={`flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto pt-[22vh] pb-[46vh] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden${tapToAdvance ? " cursor-pointer select-none" : ""}`}
            >
              {lines.map((line, i) => {
                if (i === activeIndex) {
                  return (
                    <p
                      key={i}
                      ref={activeRef}
                      className="w-full max-w-3xl text-center leading-[1.4]"
                      style={{ fontFamily: SCRIPT, fontSize: lineFontSize(line.length) }}
                    >
                      {currentWords.map((word, wi) => {
                        const spoken = wi < spokenCount;
                        const masked = offBook && !revealCurrent && !spoken;
                        return (
                          <span
                            key={wi}
                            className="transition-all duration-300"
                            style={{
                              color: spoken ? "#FF9147" : masked ? "transparent" : "rgba(246,240,229,0.96)",
                              textShadow: spoken ? "0 0 26px rgba(255,130,50,0.5)" : "none",
                            }}
                          >
                            {masked ? (
                              <span className="text-[var(--stage-fg)]/15">{"•".repeat(Math.max(2, word.replace(/[^\p{L}\p{N}]/gu, "").length))}</span>
                            ) : (
                              word
                            )}{" "}
                          </span>
                        );
                      })}
                    </p>
                  );
                }
                const done = i < activeIndex;
                return (
                  <p
                    key={i}
                    className={`w-full max-w-2xl text-center leading-relaxed transition-all duration-500 ${
                      done ? "text-[var(--stage-fg)]/25" : offBook ? "text-[var(--stage-fg)]/20 blur-[5px]" : "text-[var(--stage-fg)]/40"
                    }`}
                    style={{ fontFamily: SCRIPT, fontSize: "clamp(0.95rem, 2vw, 1.2rem)" }}
                  >
                    {line}
                  </p>
                );
              })}
            </div>

            {/* Control dock — just the actions; the listening status lives up top
                so you always know you're being heard.

                Pinned to the foot of the stage rather than sitting in the flex
                column. In flow it lost the shrink race against the scrolling
                text — the text box held 672px inside a 727px container and the
                dock rendered 25px past the bottom edge, under `overflow-hidden`,
                so Skip and Restart were invisible AND unreachable (the piece
                scrolls, not the page). Pinned, it also stops moving about as
                lines change length. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-[var(--stage)] via-[var(--stage)]/85 to-transparent pb-4 pt-12">
              <div className="pointer-events-auto flex items-center justify-center gap-2">
                {offBook && <DockButton onClick={() => setRevealCurrent(true)}>Reveal</DockButton>}
                {!tapToAdvance && (
                  <DockButton onClick={() => goToLineAndReset(activeIndex + 1)}>Skip</DockButton>
                )}
                <DockButton onClick={restart}>Restart</DockButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A small pulsing dot — a status glyph, never a control. */
function StatusDot({ state }: { state: "listening" | "paused" | "tap" }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      {state === "listening" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
      )}
      <span
        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
          state === "paused" ? "bg-[var(--stage-fg)]/30" : "bg-primary"
        }`}
      />
    </span>
  );
}

/** A clearly-tappable dock action — bordered pill, distinct from the status. */
function DockButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-[var(--stage-fg)]/15 px-3.5 py-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-[var(--stage-fg)]/60 transition-colors hover:border-primary/60 hover:text-[var(--stage-fg)]"
    >
      {children}
    </button>
  );
}

