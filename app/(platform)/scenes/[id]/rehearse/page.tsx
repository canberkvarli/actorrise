'use client';

import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SCRIPTS_FEATURE_ENABLED } from '@/lib/featureFlags';
import UnderConstructionScripts from '@/components/UnderConstructionScripts';
import api, { API_URL, getCachedAuthToken } from '@/lib/api';
import {
  trackRehearsalStarted,
  trackRehearsalLineDelivered,
  trackRehearsalCompleted,
  trackRehearsalAbandoned,
  trackRehearsalError,
} from '@/lib/analytics';
import {
  useTrialOffer,
  TrialOfferCard,
  TrialOfferBanner,
} from '@/components/billing/TrialOffer';
import { Button } from '@/components/ui/button';
import { ColdReadPrep } from '@/components/rehearse/ColdReadPrep';
import {
  ArrowLeft,
  Pause,
  Play,
  Square,
  Volume2,
  X,
  Mic,
  Sun,
  Moon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useWhisperSTT } from '@/hooks/useWhisperSTT';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { renderTextWithStageDirections, stripStageDirections } from '@/lib/stageDirections';
import { useOpenAITTS } from '@/hooks/useOpenAITTS';
import {
  getRehearsalSettings,
  getSelectedMicId,
  setSelectedMicId as persistMicId,
  type RehearsalSettings,
} from '@/lib/scenepartnerStorage';
import { MicAccessWarning } from '@/components/scenepartner/MicAccessWarning';
import { useMicPermission } from '@/hooks/useMicPermission';
import { TTSWaveform } from '@/components/scenepartner/TTSWaveform';
import { AudioWaveform } from '@/components/scenepartner/AudioWaveform';
import { parseUpgradeError } from '@/lib/upgradeError';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { cn } from '@/lib/utils';
import { ownsLine, sessionRoles } from '@/lib/character-roles';
import { tokenize, alignWords, wordMatchScore } from '@/lib/word-match';
import { shouldAdvance, MIN_QUIET_MS } from '@/lib/advance-rule';
import { buildWordTimings, spokenWordIndex } from '@/lib/speech-timing';
import { useTheme } from 'next-themes';

/** Pure dialogue for TTS — strips both [bracket] and (paren) stage directions. */
function ttsText(line: { text: string; stage_direction?: string | null }): string {
  return line.text
    .replace(/\[([^\]]+)\]/g, '')
    .replace(/\(([^)]+)\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Build TTS instructions from stage directions and scene context.
 *  The voice ACTS on directions instead of reading them aloud. */
function ttsInstructions(
  line: { text: string; stage_direction?: string | null },
  sceneContext?: string,
): string {
  const fieldDir = line.stage_direction?.trim();
  const inlineDirs = [...line.text.matchAll(/\(([^)]+)\)/g)].map(m => m[1].trim());
  const allDirs = [...new Set([fieldDir, ...inlineDirs].filter(Boolean))];
  const base = sceneContext || 'You are a skilled actor performing a scene.';
  // Shared delivery notes so the read feels like a living person mid-conversation,
  // not a flat narrator: real breath, shifting pace, and tonal movement.
  const alive =
    'Sound like a real person in the middle of a conversation, not a narrator. ' +
    'Take a natural breath before you speak. Vary your pace: let some phrases rush out, let others land slowly with a beat of silence. ' +
    'Let your pitch and tone shift with the meaning of each phrase. Never flat, monotone, or robotic. React as if you just heard your partner speak.';
  if (!allDirs.length) {
    return `${base} Deliver this line with emotional truth and full commitment. ${alive}`;
  }
  return `${base} Stage direction: ${allDirs.join('; ')}. Fully embody this — if it says "sighing", actually sigh; "whispering", drop your voice; "angrily", let real frustration through. ${alive}`;
}

/** Tiny silent WAV as a data URL — played on a gesture to unlock iOS audio so
 *  the continuous-replay elements can play programmatically afterward. */
let _silentWavUrl: string | null = null;
function silentWavUrl(): string {
  if (_silentWavUrl) return _silentWavUrl;
  const bytes = new Uint8Array(44);
  const dv = new DataView(bytes.buffer);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, 0, true);
  _silentWavUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  return _silentWavUrl;
}

const LOADING_TEXTS = [
  "Warming up the stage lights...",
  "Getting into character...",
  "Brushing up on the lines...",
  "Setting the scene...",
  "Cueing the spotlight...",
];

const FEEDBACK_LOADING_TEXTS = [
  "Reviewing your performance...",
  "Checking the emotional beats...",
  "Rewinding the tape...",
  "Consulting the director...",
  "Reading between the lines...",
  "Studying your choices...",
];

function FeedbackLoadingText() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * FEEDBACK_LOADING_TEXTS.length));
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % FEEDBACK_LOADING_TEXTS.length), 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={idx}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        className="text-sm text-neutral-500 italic"
      >
        {FEEDBACK_LOADING_TEXTS[idx]}
      </motion.p>
    </AnimatePresence>
  );
}

/* ─── Review waveform ────────────────────────────────────────────────── */

/** Decode audio blob → waveform peaks, trimming leading AND trailing silence. */
function useWaveformData(blob: Blob | null) {
  const [data, setData] = useState<{ peaks: number[]; speechStartRatio: number; speechEndRatio: number } | null>(null);

  useEffect(() => {
    if (!blob) { setData(null); return; }
    let cancelled = false;

    (async () => {
      try {
        const arrayBuf = await blob.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        const raw = decoded.getChannelData(0);
        audioCtx.close();

        const noiseThreshold = 0.02;
        const pad = Math.floor(decoded.sampleRate * 0.05); // 50ms padding

        // Find speech start: first sample above noise floor
        let speechStart = 0;
        for (let i = 0; i < raw.length; i++) {
          if (Math.abs(raw[i]) > noiseThreshold) { speechStart = i; break; }
        }
        speechStart = Math.max(0, speechStart - pad);

        // Find speech end: last sample above noise floor
        let speechEnd = raw.length;
        for (let i = raw.length - 1; i >= speechStart; i--) {
          if (Math.abs(raw[i]) > noiseThreshold) { speechEnd = i; break; }
        }
        speechEnd = Math.min(raw.length, speechEnd + pad);

        const speechStartRatio = speechStart / raw.length;
        const speechEndRatio = speechEnd / raw.length;

        // Downsample to ~60 bars from speech region only
        const barCount = 60;
        const usableLength = speechEnd - speechStart;
        const samplesPerBar = Math.max(1, Math.floor(usableLength / barCount));
        const peaks: number[] = [];
        for (let i = 0; i < barCount; i++) {
          let peak = 0;
          const offset = speechStart + i * samplesPerBar;
          for (let j = 0; j < samplesPerBar; j++) {
            const abs = Math.abs(raw[offset + j] ?? 0);
            if (abs > peak) peak = abs;
          }
          peaks.push(peak);
        }
        const maxPeak = Math.max(...peaks, 0.01);
        const normalized = peaks.map(p => p / maxPeak);

        if (!cancelled) setData({ peaks: normalized, speechStartRatio, speechEndRatio });
      } catch {
        if (!cancelled) setData(null);
      }
    })();

    return () => { cancelled = true; };
  }, [blob]);

  return data;
}

function ReviewWaveform({
  blob,
  isPlaying,
  audioRef,
  speechStartRatio,
  speechEndRatio,
  peaks,
  onToggle,
}: {
  blob: Blob;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  speechStartRatio: number;
  speechEndRatio: number;
  peaks: number[];
  onToggle: () => void;
}) {
  const barContainerRef = useRef<HTMLDivElement>(null);
  const mutedOverlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const speechSpan = (speechEndRatio - speechStartRatio) || 1;

  // RAF loop — update clipPath on the muted overlay directly (no React re-render)
  useEffect(() => {
    const overlay = mutedOverlayRef.current;
    if (!overlay) return;
    if (!isPlaying || !audioRef.current) {
      overlay.style.clipPath = 'inset(0 0 0 0%)';
      return;
    }
    const audio = audioRef.current;
    overlay.style.clipPath = 'inset(0 0 0 0%)';
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        const rawPct = audio.currentTime / dur;
        // Map [speechStartRatio..speechEndRatio] → [0..1]
        const speechPct = Math.max(0, Math.min(1, (rawPct - speechStartRatio) / speechSpan));
        overlay.style.clipPath = `inset(0 0 0 ${speechPct * 100}%)`;
        // Auto-stop at speech end (skip trailing silence)
        if (rawPct >= speechEndRatio) {
          audio.pause();
          audio.currentTime = speechStartRatio * dur;
          overlay.style.clipPath = 'inset(0 0 0 0%)';
          onToggle();
          return; // stop RAF
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, audioRef, speechStartRatio, speechEndRatio, speechSpan, onToggle]);

  // Click-to-seek on waveform
  const handleBarClick = (e: React.MouseEvent) => {
    const container = barContainerRef.current;
    const audio = audioRef.current;
    if (!container || !audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    // Map click [0..1] → [speechStart..speechEnd] in audio time
    audio.currentTime = (speechStartRatio + clickRatio * speechSpan) * audio.duration;
    if (!isPlaying) onToggle();
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="w-6 h-6 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center shrink-0 transition-colors"
      >
        {isPlaying
          ? <Pause className="w-3 h-3 text-neutral-300" />
          : <Play className="w-3 h-3 text-neutral-300 ml-0.5" />
        }
      </button>
      {/* Two stacked layers: orange bars below, muted overlay on top clipped from left */}
      <div
        ref={barContainerRef}
        className="relative flex-1 h-8 cursor-pointer"
        onClick={handleBarClick}
      >
        {/* Bottom: all bars in primary color (will show as "played" region) */}
        <div className="absolute inset-0 flex items-center gap-[2px]">
          {peaks.map((peak, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-primary"
              style={{ height: `${Math.max(8, peak * 100)}%` }}
            />
          ))}
        </div>
        {/* Top: muted overlay, clip-path shrinks from left as audio plays */}
        <div ref={mutedOverlayRef} className="absolute inset-0 flex items-center gap-[2px]" style={{ clipPath: 'inset(0 0 0 0%)' }}>
          {peaks.map((peak, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-neutral-700"
              style={{ height: `${Math.max(8, peak * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Wrapper that decodes a blob and renders a ReviewWaveform. */
function LineWaveformPlayer({
  blob,
  isPlaying,
  audioRef,
  onToggle,
  onBounds,
}: {
  blob: Blob;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onToggle: (speechStartRatio: number, speechEndRatio: number) => void;
  /** Reports decoded speech bounds once, so continuous replay can trim silence. */
  onBounds?: (speechStartRatio: number, speechEndRatio: number) => void;
}) {
  const waveData = useWaveformData(blob);
  const reportedRef = useRef(false);
  useEffect(() => {
    if (waveData && !reportedRef.current) {
      reportedRef.current = true;
      onBounds?.(waveData.speechStartRatio, waveData.speechEndRatio);
    }
  }, [waveData, onBounds]);
  if (!waveData) return null;
  return (
    <ReviewWaveform
      blob={blob}
      isPlaying={isPlaying}
      audioRef={audioRef}
      speechStartRatio={waveData.speechStartRatio}
      speechEndRatio={waveData.speechEndRatio}
      peaks={waveData.peaks}
      onToggle={() => onToggle(waveData.speechStartRatio, waveData.speechEndRatio)}
    />
  );
}

/**
 * How often to check whether the actor has stopped speaking.
 *
 * Comfortably finer than MIN_QUIET_MS, so the quiet window is what decides the
 * timing rather than the polling rate.
 */
const WATCHER_INTERVAL_MS = Math.floor(MIN_QUIET_MS / 3);

/**
 * The room the scene is rehearsed in.
 *
 * Dark keeps the original house-lights-down feel. Light is warm rather than
 * white, because a page of dialogue on a pure-white field is glary to read from
 * for as long as a scene takes.
 *
 * This used to be a bare `bg-[#191410]` under a hardcoded `dark` class on the
 * rehearsal root, which pinned the whole screen to dark whatever the actor had
 * chosen — the toggle in the platform header simply did nothing in here.
 */
const STAGE_SURFACE = 'bg-[#f2ece2] text-neutral-900 dark:bg-[#191410] dark:text-neutral-100';

/** Same room, used where only the background is being painted. */
const STAGE_BG = 'bg-[#f2ece2] dark:bg-[#191410]';

/**
 * The page the script is printed on — always lighter than the room around it,
 * in both themes, so the eye goes to the words.
 */
const SCRIPT_SURFACE = 'bg-white dark:bg-[#faf7f1] text-neutral-900';

/**
 * The floating control pill, which stays dark in both themes on purpose: it
 * sits *over* the scene the way a video player's controls sit over a film, and
 * it states its own `bg-neutral-900/90` rather than relying on a variant.
 *
 * Note the shape of this class, because it is a trap. The dark variant here is
 * `@custom-variant dark (&:is(.dark *))` — a *descendant* selector. An element
 * carrying `dark` therefore does not match its own `dark:` utilities, only its
 * children do. Pairing this with STAGE_BG on one element, which four overlays
 * used to do, left a cream panel wearing white text: the background fell back
 * to its light value while the text stayed at its dark one. Those overlays now
 * use STAGE_SURFACE and follow the theme.
 */
const CHROME_DARK = 'dark';

/** Type on the stage, in either theme. */
const STAGE_INK = 'text-neutral-900 dark:text-neutral-100';
/** A step back from the type: names, secondary lines. */
const STAGE_INK_SOFT = 'text-neutral-600 dark:text-neutral-400';
/** Furthest back: labels, hints, counts. */
const STAGE_INK_FAINT = 'text-neutral-500 dark:text-neutral-500';
/** Rules and outlines drawn on the stage. */
const STAGE_RULE = 'border-neutral-300 dark:border-neutral-700';

/**
 * How much of the AI's line may remain when the microphone starts.
 *
 * The mic used to arm only after the voice finished, so the actor's first word
 * landed in the gap while it was still opening. Arming early means it is already
 * hot on the cue — everything heard before the voice ends is discarded, so the
 * scene partner never hears itself.
 */
const MIC_PREARM_MS = 600;

/* ─── Word match scoring ─────────────────────────────────────────────── */

interface WordMatchResult {
  words: { word: string; matched: boolean }[];
  willAdvance: boolean;
}

/**
 * Renders a line token by token, letting the caller colour each word.
 *
 * `classForWord` receives every word position a display token covers — usually
 * one, but "talk.We" normalizes to two — and returns the class for that token.
 * Stage directions are italic and consume no word positions, since nobody says
 * them out loud.
 *
 * Positions are counted, not keyed by text, so a word appearing twice in a line
 * is coloured independently at each place it appears.
 */
function renderLineTokens(text: string, classForWord: (indices: number[]) => string) {
  let wordPos = 0;

  const renderToken = (token: string, key: string) => {
    const normed = tokenize(token);
    if (normed.length === 0) return <span key={key}>{token}</span>; // punctuation only
    const indices = normed.map((_, i) => wordPos + i);
    wordPos += normed.length;
    return <span key={key} className={classForWord(indices)}>{token}</span>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const processSegment = (segment: string, baseKey: string) => {
    segment.split(/(\s+)/).forEach((token, i) => {
      if (/^\s*$/.test(token)) { parts.push(token); return; }
      parts.push(renderToken(token, `${baseKey}-${i}`));
    });
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) processSegment(text.slice(lastIndex, match.index), `t${lastIndex}`);
    parts.push(
      <em key={`d${match.index}`} className="italic text-muted-foreground text-[0.85em]">
        ({match[1]})
      </em>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) processSegment(text.slice(lastIndex), `t${lastIndex}`);
  return <>{parts}</>;
}

/**
 * The actor's own line, coloured by what the microphone caught.
 *
 * Three states, not two. A word that was passed over gets a dotted underline
 * rather than staying dim: with only "matched" and "not yet", a word the mic
 * missed looks exactly like a word you haven't reached, and there's no way to
 * tell whether the app is behind you or lost.
 */
function renderLineWithWordHighlights(text: string, result: WordMatchResult) {
  const lastMatched = result.words.reduce((acc, w, i) => (w.matched ? i : acc), -1);

  return renderLineTokens(text, (indices) => {
    if (indices.some(i => result.words[i]?.matched)) return 'text-primary';
    // Behind the furthest word heard, so the actor has already moved past it.
    if (indices.every(i => i < lastMatched)) {
      return 'text-foreground/60 underline decoration-dotted underline-offset-4';
    }
    return 'opacity-40';
  });
}

/**
 * The scene partner's line, swept as the voice speaks it.
 *
 * `spokenIndex` is the word being said right now; -1 means the sweep isn't
 * running, in which case the line simply sits at full weight.
 */
function renderLineWithSpokenSweep(text: string, spokenIndex: number) {
  if (spokenIndex < 0) return renderLineTokens(text, () => '');

  return renderLineTokens(text, (indices) => {
    if (indices.some(i => i === spokenIndex)) return 'text-primary transition-colors duration-150';
    if (indices.every(i => i < spokenIndex)) return 'opacity-50 transition-opacity duration-500';
    return 'opacity-75';
  });
}

/* ─── Types ──────────────────────────────────────────────────────────── */

/**
 * Is this line the actor's to speak?
 *
 * An actor can cover several parts in one run, and a script can cue two
 * characters at once ("MOEKETSI AND DAN:") — that line belongs to whoever is
 * playing either of them. `cueNames` is every speaker label in the scene, which
 * is what lets a joint cue be told apart from a character actually named that.
 */
function isMyLine(
  session: { user_character?: string | null; user_characters?: string[] | null } | null | undefined,
  lineCharacter: string | null | undefined,
  cueNames: readonly string[],
): boolean {
  if (!session) return false;
  return ownsLine(lineCharacter, sessionRoles(session), cueNames);
}

interface RehearsalSession {
  id: number;
  scene_id: number;
  user_character: string;
  /** Every character the actor speaks for. Absent on pre-multi-role sessions. */
  user_characters?: string[];
  ai_character: string;
  status: string;
  current_line_index: number;
  total_lines_delivered: number;
  max_lines?: number | null;
  ai_voice_id?: string | null;
  completion_percentage: number;
  first_line_for_user?: string | null;
  current_line_for_user?: string | null;
}

interface SceneLineRow {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
  word_count: number;
}

interface SceneWithLines {
  id: number;
  title: string;
  description?: string;
  play_title: string;
  play_author: string;
  lines: SceneLineRow[];
}

/* ─── Component ──────────────────────────────────────────────────────── */

export default function RehearsalPage() {
  if (!SCRIPTS_FEATURE_ENABLED) return <UnderConstructionScripts />;

  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sceneId = params.id as string;
  const sessionId = searchParams.get('session');
  const scriptId = searchParams.get('script');
  const voiceParam = searchParams.get('voice');
  // Cold-read mode: a timed read-through before the (single-take) performance.
  const coldRead = searchParams.get('mode') === 'cold';
  const coldReadCharacter = searchParams.get('character');
  // First-run: the user was dropped here straight from /first-scene. On the
  // completion screen we add a win beat + one clear next step (search with
  // intent) instead of leaving them at "now what?".
  const firstRun = searchParams.get('firstRun') === '1';
  const [prepDone, setPrepDone] = useState(!coldRead);

  const backUrl = scriptId
    ? `/practice/${scriptId}/scenes/${sceneId}/edit`
    : '/rehearse';

  /* ── Core state ─────────────────────────────────────────────────── */

  const [session, setSession] = useState<RehearsalSession | null>(null);
  const [sceneWithLines, setSceneWithLines] = useState<SceneWithLines | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [focusInitialized, setFocusInitialized] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [linesRemaining, setLinesRemaining] = useState<number | null>(null); // tracked for API but not displayed
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<any>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature: string; message: string }>({
    open: false, feature: "", message: "",
  });
  const [exiting, setExiting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showMicPicker, setShowMicPicker] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicIdState] = useState<string | undefined>(() =>
    typeof window !== 'undefined' ? (getSelectedMicId() || undefined) : undefined
  );
  const setSelectedMicId = useCallback((id: string) => {
    setSelectedMicIdState(id || undefined);
    persistMicId(id);
  }, []);
  const [showPausePlayOverlay, setShowPausePlayOverlay] = useState<'pause' | 'play' | null>(null);
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);
  const [fadeToReview, setFadeToReview] = useState(false);

  /* ── Session review: audio + transcript accumulation ─────────────── */

  const lineAudioBlobsRef = useRef<Map<number, Blob>>(new Map());
  const lineTranscriptsRef = useRef<Map<number, string>>(new Map());
  // How many times the user has attempted each line — powers a lenient
  // second-chance advance so accented/quiet deliveries aren't trapped looping.
  const lineAttemptsRef = useRef<Map<number, number>>(new Map());
  const sessionStartTimeRef = useRef<number>(Date.now());
  const [sessionDuration, setSessionDuration] = useState(0);
  const [playingLineIdx, setPlayingLineIdx] = useState<number | null>(null);

  /* ── Analytics bookkeeping ─────────────────────────────────────── */
  // Plain refs, not state: these are read from unmount/pagehide handlers where a
  // re-render will never come, and they must never themselves cause one.
  const rehearsalCompletedRef = useRef(false);
  const rehearsalTrackedRef = useRef<string | null>(null);
  const firstLineTrackedRef = useRef(false);

  /* ── Continuous scene replay (session review) ──────────────────── */
  // Plays the whole finished scene as one uninterrupted take: user-recorded
  // lines back-to-back with the AI partner's lines regenerated in order.
  const [sceneReplayIdx, setSceneReplayIdx] = useState<number | null>(null);
  const replayActiveRef = useRef(false);
  const replayIndexRef = useRef<number | null>(null);
  const replayUserAudioRef = useRef<HTMLAudioElement | null>(null); // persistent element for user blobs (iOS reuse)
  const replayUserUrlRef = useRef<string | null>(null);
  const replayTrimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const replayBoundsRef = useRef<Map<number, { startRatio: number; endRatio: number }>>(new Map());
  const advanceReplayRef = useRef<() => void>(() => {});
  const stopSceneReplayRef = useRef<() => void>(() => {});
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const reviewAudioUrlRef = useRef<string | null>(null);

  /* ── Local script-following state ───────────────────────────────── */

  // The current position in orderedLines. null = not started.
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  // Whether the AI is currently speaking (local tracking, separate from TTS hook state)
  const [lastAiLine, setLastAiLine] = useState<string | null>(null);

  const currentLineRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);
  /** The mic probe has been consulted once for this session. */
  const autoBeganRef = useRef(false);
  /**
   * We walked on stage without a tap, so no user gesture was spent and the
   * browser may still refuse to play the opening line. Cleared the moment audio
   * is actually heard.
   */
  const beganWithoutGestureRef = useRef(false);
  /**
   * False until the mic probe has answered. Without it the gate paints for the
   * few hundred ms before auto-begin fires, and a glimpse of a screen you are
   * about to skip is worse than the screen.
   */
  const [gateChecked, setGateChecked] = useState(false);
  const gotResultRef = useRef(false);
  const lastKnownVoiceIdRef = useRef(voiceParam || 'coral');
  // Maps each AI character name → assigned TTS voice ID (for multi-character scenes)
  const characterVoiceMapRef = useRef<Map<string, string>>(new Map());
  // Maps each AI character name → voice avatar info { label, color } for display
  const [characterVoiceMeta, setCharacterVoiceMeta] = useState<Map<string, { label: string; color: string }>>(new Map());
  const lastAiLineForFallbackRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSilentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to break stale closures — always point to latest versions
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const advanceScriptRef = useRef<(idx: number) => void>(() => {});

  /* ── Theme ──────────────────────────────────────────────────────── */

  const { setTheme, resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    // The wipe is nice on a settings page and wrong here — a full-screen
    // transition over a scene in progress reads as the app doing something to
    // the rehearsal. Swap it plainly.
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  /* ── Settings ───────────────────────────────────────────────────── */

  const [rehearsalSettings] = useState<RehearsalSettings>(() =>
    typeof window !== 'undefined'
      ? getRehearsalSettings()
      : { pauseBetweenLinesSeconds: 0.3, skipMyLineIfSilent: false, skipAfterSeconds: 10, countdownSeconds: 3, useAIVoice: true, highlightMyLines: true, autoAdvanceOnFinish: true }
  );
  const highlightMyLines = rehearsalSettings.highlightMyLines;
  const [useAIVoice] = useState(() =>
    typeof window !== 'undefined' ? getRehearsalSettings().useAIVoice !== false : true
  );

  /* ── Derived: ordered lines (memoized) ─────────────────────────── */

  const orderedLines = useMemo(
    () => sceneWithLines?.lines?.slice().sort((a, b) => a.line_order - b.line_order) ?? [],
    [sceneWithLines?.lines],
  );
  const orderedLinesRef = useRef(orderedLines);

  // Every speaker label in the scene. Line ownership needs it to tell a joint cue
  // ("MOEKETSI AND DAN") apart from a character genuinely named that.
  const cueNames = useMemo(
    () => Array.from(new Set(orderedLines.map(l => l.character_name))),
    [orderedLines],
  );
  const cueNamesRef = useRef(cueNames);
  cueNamesRef.current = cueNames;

  // Build rich voice context from scene metadata — reused in every TTS call
  const sceneVoiceContext = useMemo(() => {
    const s = sceneWithLines;
    const ai = session?.ai_character;
    if (!s || !ai) return '';
    const parts = [`You are ${ai}, a character in "${s.title}"`];
    if (s.play_title) parts[0] += ` from "${s.play_title}"`;
    parts[0] += '.';
    if (s.description) parts.push(`Scene context: ${s.description.slice(0, 150)}.`);
    parts.push('You are a skilled actor. React naturally to the emotional stakes. Let pauses breathe. Commit fully.');
    return parts.join(' ');
  }, [sceneWithLines, session?.ai_character]);
  const sceneVoiceContextRef = useRef(sceneVoiceContext);
  sceneVoiceContextRef.current = sceneVoiceContext;
  orderedLinesRef.current = orderedLines;

  // Current user line text (derived from activeLineIndex)
  const currentUserLineText = useMemo(() => {
    if (activeLineIndex == null || !session) return null;
    const line = orderedLines[activeLineIndex];
    if (!line || !isMyLine(session, line.character_name, cueNamesRef.current)) return null;
    return line.text;
  }, [activeLineIndex, orderedLines, session]);

  /* ── Auto-listen state ─────────────────────────────────────────── */

  const [autoListenLineKey, setAutoListenLineKey] = useState<string | null>(null);
  const activeUserLineKey = session && currentUserLineText
    ? `${session.id}:${activeLineIndex}`
    : null;

  /* ── Speech recognition (Whisper via MediaRecorder) ────────────── */

  const [speechError, setSpeechError] = useState<string | null>(null);

  const [wordMatchResult, setWordMatchResult] = useState<WordMatchResult | null>(null);
  const pendingAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shouldShake, setShouldShake] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [micSwitchToast, setMicSwitchToast] = useState<{ deviceId: string; label: string } | null>(null);
  const micSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownMicIdsRef = useRef<Set<string>>(new Set());
  const srAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Per-line delivery guard — prevents the same line from being delivered twice,
  // without blocking delivery of subsequent lines (unlike isProcessing flag)
  const lastDeliveredIndexRef = useRef<number | null>(null);;
  const pendingRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live word matching via SpeechRecognition (for real-time highlighting while Whisper records)
  const [liveMatchedIndices, setLiveMatchedIndices] = useState<Set<number>>(new Set());
  const bestMatchedRef = useRef<Set<number>>(new Set()); // accumulates ever-matched indices so SR regressions don't un-highlight words
  const liveRecognitionRef = useRef<any>(null);
  // Prevents double-advance when SR final result fires before Whisper returns
  const srAdvancedRef = useRef(false);
  // Gate for Whisper: only allow transcription when SR has matched words from the line
  const whisperGateRef = useRef(false);
  // Latest read of the current line, written by recognition and read by the
  // advance watcher. A ref because it updates far faster than it needs rendering.
  const liveReadRef = useRef<{ transcript: string; matched: Set<number> }>({
    transcript: '',
    matched: new Set(),
  });

  const {
    startListening,
    stopListening,
    cancelTranscription,
    getRecordedBlob,
    prewarmStream,
    isListening,
    isTranscribing,
    isSupported: isSpeechRecognitionSupported,
    liveTranscript,
    resetTranscript,
    msSinceVoice,
    heardAnySpeech,
    analyserRef,
    streamRef: whisperStreamRef,
    audioCtxRef: whisperAudioCtxRef,
  } = useWhisperSTT({
    silenceThreshold: 10,
    // Actors take beats mid-line, and cold readers pause to scan ahead. 2s cut
    // people off mid-thought; the detector also now needs sustained speech before
    // this timer can run at all.
    silenceTimeoutMs: 3500,
    speechGateRef: whisperGateRef,
    deviceId: selectedMicId,
    prompt: currentUserLineText ? stripStageDirections(currentUserLineText) : undefined,
    onResult: (text) => {
      if (srAdvancedRef.current) return; // SR already advanced this line — ignore late Whisper result
      gotResultRef.current = true;
      setSpeechError(null);
      const expected = currentUserLineText ? stripStageDirections(currentUserLineText) : '';
      const score = wordMatchScore(expected, text);
      const curIdx = activeLineIndexRef.current ?? 0;
      const priorAttempts = lineAttemptsRef.current.get(curIdx) ?? 0;
      // First pass wants a solid match. But once the user has already run the
      // line and it bounced, accept a looser read so an accent, a mumble, or a
      // dropped filler doesn't trap them repeating the same line forever.
      const strongMatch = !expected || score >= 0.5;
      const lenientMatch = priorAttempts >= 1 && score >= 0.3;
      const willAdvance = strongMatch || lenientMatch;

      // Build per-word match result from expected line words. Match SEQUENTIALLY
      // (left-to-right with an advancing cursor), mirroring the live SR path — so a
      // word that repeats later in the line, or a common word, isn't highlighted
      // until the reader actually reaches it. Set-based matching used to light up
      // every occurrence at once, highlighting words further down the line before
      // you got there.
      const expectedWordArr = expected ? tokenize(expected) : [];
      const matchedIdx = alignWords(expectedWordArr, tokenize(text));
      const words = expectedWordArr.map((word, i) => ({ word, matched: matchedIdx.has(i) }));

      setWordMatchResult({ words, willAdvance });

      if (willAdvance) {
        // Brief visual feedback, then advance
        pendingAdvanceRef.current = setTimeout(() => {
          pendingAdvanceRef.current = null;
          setWordMatchResult(null);
          handleDeliverLine(text);
          resetTranscript();
        }, 700);
      } else {
        // Remember this attempt so the next run of the same line is judged leniently.
        lineAttemptsRef.current.set(curIdx, priorAttempts + 1);
        // Jitter animation to signal failed match
        setShouldShake(true);
        setTimeout(() => setShouldShake(false), 600);
        // Toast notification — tell user to run the full line
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        const missedCount = words.filter(w => !w.matched).length;
        setToast(missedCount === 1 ? 'Missed a word — run the full line again' : `Missed ${missedCount} words — run the full line again`);
        toastTimerRef.current = setTimeout(() => setToast(null), 3500);
        // Auto-retry after 2s — reset gate so auto-listen fires
        if (pendingRetryRef.current) clearTimeout(pendingRetryRef.current);
        pendingRetryRef.current = setTimeout(() => {
          pendingRetryRef.current = null;
          setWordMatchResult(null);
          setAutoListenLineKey(null);
        }, 2000);
      }
    },
    onEnd: () => {
      // No speech detected — leave autoListenLineKey set so auto-listen
      // doesn't re-fire. User must tap to retry.
    },
    onError: (msg) => {
      setSpeechError(msg);
      // Don't reset autoListenLineKey — user must tap to retry manually
    },
  });

  /* ── TTS: advance to next line after AI finishes speaking ──────── */

  const activeLineIndexRef = useRef(activeLineIndex);
  activeLineIndexRef.current = activeLineIndex;

  const handleTTSEnd = useCallback(() => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    // Capture nextIdx NOW (not in the timer callback) to avoid race conditions
    const nextIdx = (activeLineIndexRef.current ?? 0) + 1;
    const doAdvance = () => {
      setLastAiLine(null);
      advanceScriptRef.current(nextIdx);
    };
    // Pause before advancing: short gap for consecutive AI lines, user setting otherwise
    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    const nextIsAlsoAI = sess && nextIdx < lines.length && !isMyLine(sess, lines[nextIdx].character_name, cueNamesRef.current);
    // AI→AI keeps a beat so two partners don't run together.
    //
    // AI→user is zero. A real scene partner finishes their line and the next one
    // is already yours; any pause the app inserts on top of the actor's own
    // reaction time is felt as the app being slow to hand over. The configured
    // pause still applies everywhere else.
    const pauseMs = nextIsAlsoAI
      ? Math.max(200, rehearsalSettings.pauseBetweenLinesSeconds * 1000)
      : 0;
    pauseTimerRef.current = setTimeout(() => {
      pauseTimerRef.current = null;
      doAdvance();
    }, pauseMs);
  }, [rehearsalSettings.pauseBetweenLinesSeconds]);

  /* ── Browser speech synthesis (fallback) ───────────────────────── */

  const {
    speak: speakBrowser,
    isSpeaking: isSpeakingBrowser,
    isSupported: isSpeechSynthesisSupported,
  } = useSpeechSynthesis({
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    onEnd: handleTTSEnd,
  });

  /* ── OpenAI TTS (primary) ──────────────────────────────────────── */

  const {
    speak: speakAI,
    preload: preloadTTS,
    cancel: cancelAI,
    unlock: unlockAudio,
    isSpeaking: isSpeakingAI,
    isLoading: isLoadingAI,
    audioElementRef: aiAudioRef,
  } = useOpenAITTS({
    onEnd: handleTTSEnd,
    onError: (err) => {
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "AI Voice", message: upgrade.message });
        return;
      }
      /* Auto-begin spends no user gesture, and a browser that will not autoplay
         audio rejects the opening line with NotAllowedError. Hand the scene back
         to the gate rather than running it silently: the tap there is the
         gesture, which is the whole reason that screen exists. */
      if (beganWithoutGestureRef.current && err instanceof Error && err.name === 'NotAllowedError') {
        beganWithoutGestureRef.current = false;
        autoStartedRef.current = false;
        setArmed(false);
        setGateChecked(true);
        return;
      }
      const fallbackLine = lastAiLineForFallbackRef.current;
      if (fallbackLine && isSpeechSynthesisSupported) {
        speakBrowser(fallbackLine);
      }
    },
  });

  /* ── OpenAI TTS (dedicated instance for continuous scene replay) ──
   * Separate from the rehearsal instance so its onEnd chains to the next
   * replay segment instead of advancing the live script. Shares the module
   * audio cache, so AI lines just rehearsed replay instantly. */
  const {
    speak: speakReplayAI,
    cancel: cancelReplayAI,
    unlock: unlockReplayAI,
  } = useOpenAITTS({
    onEnd: () => advanceReplayRef.current(),
    onError: () => advanceReplayRef.current(),
  });

  const anySpeaking = isSpeakingBrowser || isSpeakingAI || isLoadingAI;

  /* ── AI word sweep, and arming the mic before the cue lands ────── */

  /** Index of the word the scene partner is speaking; -1 when not speaking. */
  const [aiSpokenIndex, setAiSpokenIndex] = useState(-1);
  const aiHighlightRafRef = useRef<number | null>(null);
  const prewarmStreamRef = useRef(prewarmStream);
  prewarmStreamRef.current = prewarmStream;

  useEffect(() => {
    if (!isSpeakingAI) {
      setAiSpokenIndex(-1);
      if (aiHighlightRafRef.current) cancelAnimationFrame(aiHighlightRafRef.current);
      return;
    }

    // Once per line — acquiring a live stream twice is wasted work.
    let armed = false;

    const tick = () => {
      const audio = aiAudioRef.current;
      const lineText = lastAiLineRef.current;
      if (!audio || !audio.duration || audio.paused || !lineText) {
        aiHighlightRafRef.current = requestAnimationFrame(tick);
        return;
      }

      const durationMs = audio.duration * 1000;
      const elapsedMs = audio.currentTime * 1000;

      // Syllables, not characters or an even split: "through" and "away" are the
      // same length written down and nothing like it spoken.
      const words = stripStageDirections(lineText).split(/\s+/).filter(Boolean);
      setAiSpokenIndex(spokenWordIndex(buildWordTimings(words, durationMs), elapsedMs));

      // Open the microphone while the partner is still talking, so the actor's
      // first word doesn't land in the gap where it used to be opening. Nothing
      // is recorded yet — this only acquires the stream and resumes the audio
      // context, which is where the delay actually was.
      if (!armed && durationMs - elapsedMs <= MIC_PREARM_MS) {
        armed = true;
        prewarmStreamRef.current();
      }

      aiHighlightRafRef.current = requestAnimationFrame(tick);
    };
    aiHighlightRafRef.current = requestAnimationFrame(tick);
    return () => { if (aiHighlightRafRef.current) cancelAnimationFrame(aiHighlightRafRef.current); };
  }, [isSpeakingAI]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep lastAiLine in a ref for the rAF callback
  const lastAiLineRef = useRef(lastAiLine);
  lastAiLineRef.current = lastAiLine;

  /* ── Speak a line (AI or browser) ──────────────────────────────── */

  const speakLine = useCallback((text: string, instructions: string = '', charName?: string) => {
    if (isListening) stopListening();
    lastAiLineForFallbackRef.current = text;
    if (useAIVoice) {
      const voiceId = charName
        ? (characterVoiceMapRef.current.get(charName) ?? lastKnownVoiceIdRef.current)
        : lastKnownVoiceIdRef.current;
      speakAI(text, voiceId, instructions);
    } else if (isSpeechSynthesisSupported) {
      speakBrowser(text);
    }
  }, [useAIVoice, speakAI, speakBrowser, isSpeechSynthesisSupported, isListening, stopListening]);
  const speakLineRef = useRef(speakLine);
  speakLineRef.current = speakLine;
  const preloadTTSRef = useRef(preloadTTS);
  preloadTTSRef.current = preloadTTS;
  const handleTTSEndRef = useRef(handleTTSEnd);
  handleTTSEndRef.current = handleTTSEnd;

  /* ── AI-turn self-heal ──────────────────────────────────────────────
   * If an AI line hasn't started speaking after a while (e.g. a stalled fetch),
   * auto-advance so the scene can never freeze on "Waiting". */
  useEffect(() => {
    if (paused || (countdown !== null && countdown > 0)) return;
    if (activeLineIndex == null) return;
    // Read from refs so the timer isn't reset by unrelated re-renders
    // (orderedLines/session change identity often during a session).
    const sess = sessionRef.current;
    const line = orderedLinesRef.current[activeLineIndex];
    if (!sess || !line || isMyLine(sess, line.character_name, cueNamesRef.current)) return; // AI lines only
    if (isSpeakingAI || isSpeakingBrowser) return; // audio is actually playing — fine
    const autoT = setTimeout(() => { handleTTSEndRef.current(); }, 14000); // self-heal
    return () => clearTimeout(autoT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLineIndex, isSpeakingAI, isSpeakingBrowser, isLoadingAI, paused, countdown]);

  /* ── Core: advance to a specific line index ────────────────────── */

  const advanceScript = (idx: number) => {
    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    if (!sess || !lines.length) return;

    if (idx >= lines.length) {
      // Scene complete — fade out rehearsal, then show review
      setActiveLineIndex(lines.length - 1);
      setLastAiLine(null);
      stopAllAudioRef.current(); // kill mic + TTS before entering review
      loadFeedback();
      const elapsed = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      setSessionDuration(elapsed);
      // Mark completed before the abandon handler can see it. The unmount path
      // reads showFeedbackRef, which only flips 900ms later, so without this a
      // finished scene would also report itself abandoned on the way out.
      rehearsalCompletedRef.current = true;

      // How much of each line the mic actually caught. This used to be shown to
      // the actor as "% accuracy" and it is now analytics only — it tracks the
      // health of the speech pipeline, and an actor reading it as a grade on
      // their own delivery is reading it wrong.
      let matchTotal = 0;
      let delivered = 0;
      lines.forEach((l, i) => {
        if (!isMyLine(sess, l.character_name, cueNamesRef.current)) return;
        const transcript = lineTranscriptsRef.current.get(i);
        if (!transcript) return;
        matchTotal += wordMatchScore(stripStageDirections(l.text), transcript);
        delivered++;
      });

      trackRehearsalCompleted({
        mode: 'scene',
        duration_seconds: elapsed,
        lines_total: lines.length,
        ...(delivered > 0 && { transcript_match_pct: Math.round((matchTotal / delivered) * 100) }),
      });
      // Brief pause so last line highlights are visible, then fade to black
      setTimeout(() => setFadeToReview(true), 400);
      // After fade completes, switch to review
      setTimeout(() => setShowFeedback(true), 900);
      return;
    }

    setActiveLineIndex(idx);
    const line = lines[idx];

    if (!isMyLine(sess, line.character_name, cueNamesRef.current)) {
      // AI's turn — tiny delay so scroll settles before voice starts
      setLastAiLine(line.text);
      setAutoListenLineKey(null);
      if (speakDelayRef.current) clearTimeout(speakDelayRef.current);
      speakDelayRef.current = setTimeout(() => {
        speakDelayRef.current = null;
        speakLineRef.current(ttsText(line), ttsInstructions(line, sceneVoiceContextRef.current), line.character_name);
      }, 100);
    } else {
      // User's turn — set up for auto-listen
      setLastAiLine(null);
      setAutoListenLineKey(null);
      gotResultRef.current = false;
    }
  };
  advanceScriptRef.current = advanceScript;

  /* ── Deliver user's line (API for tracking + local advancement) ── */

  const handleDeliverLine = async (text: string) => {
    const toSend = text.trim();
    const sess = sessionRef.current;
    const currentIdx = activeLineIndexRef.current ?? 0;
    if (!toSend || !sess) return;
    // Prevent double-delivery of the same line without blocking subsequent lines
    if (lastDeliveredIndexRef.current === currentIdx) return;
    lastDeliveredIndexRef.current = currentIdx;
    if (skipSilentTimerRef.current) {
      clearTimeout(skipSilentTimerRef.current);
      skipSilentTimerRef.current = null;
    }
    // Capture audio blob + transcript for session review playback
    const blob = getRecordedBlob();
    if (blob) lineAudioBlobsRef.current.set(currentIdx, blob);
    lineTranscriptsRef.current.set(currentIdx, toSend);

    // The real activation moment: not loading the page, but opening your mouth.
    // seconds_to_first_line covers mic permission, the audio check and the
    // countdown, so a bad number here points at setup friction, not the scene.
    if (!firstLineTrackedRef.current) {
      firstLineTrackedRef.current = true;
      trackRehearsalLineDelivered({
        mode: 'scene',
        seconds_to_first_line: Math.floor(
          (Date.now() - sessionStartTimeRef.current) / 1000
        ),
      });
    }

    if (isListening) stopListening();
    resetTranscript();

    // Advance locally IMMEDIATELY for snappy UX
    const nextIdx = (activeLineIndexRef.current ?? 0) + 1;
    advanceScriptRef.current(nextIdx);

    // API call in background for tracking
    setIsProcessing(true);
    try {
      const response = await api.post<{
        ai_response: string;
        line_text?: string;
        ai_voice_id?: string;
        completion_percentage: number;
        session_status: string;
        lines_remaining?: number | null;
      }>('/api/scenes/rehearse/deliver', {
        session_id: sess.id,
        user_input: toSend,
        request_feedback: false,
        request_retry: false,
        // Tell the server exactly which line this was. It used to infer the
        // position from a cursor that only moved on the actor's turns, so
        // deliveries were filed against the wrong lines.
        scene_line_id: orderedLinesRef.current[currentIdx]?.id ?? null,
      });

      const data = response.data;
      // Only use API voice if user didn't explicitly set one from the edit page
      if (data.ai_voice_id && !voiceParam) lastKnownVoiceIdRef.current = data.ai_voice_id;

      setSession(prev => prev ? {
        ...prev,
        completion_percentage: data.completion_percentage,
        total_lines_delivered: prev.total_lines_delivered + 1,
      } : prev);
      if (data.lines_remaining != null) setLinesRemaining(data.lines_remaining);

      if (data.session_status === 'completed') {
        stopAllAudioRef.current(); // kill mic + TTS before entering review
        setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
        loadFeedback(); // fire-and-forget — feedback loads while review is already visible
        setFadeToReview(true);
        setTimeout(() => setShowFeedback(true), 500);
      }
      setError(null);
    } catch (err: any) {
      const upgrade = parseUpgradeError(err);
      if (upgrade) {
        setUpgradeModal({ open: true, feature: "ScenePartner", message: upgrade.message });
      }
      // Don't undo local advancement — just log error
    } finally {
      setIsProcessing(false);
    }
  };

  // Always-fresh refs for SR callbacks (avoid stale closures in the isListening effect)
  const handleDeliverLineRef = useRef(handleDeliverLine);
  handleDeliverLineRef.current = handleDeliverLine;
  const cancelTranscriptionRef = useRef(cancelTranscription);
  cancelTranscriptionRef.current = cancelTranscription;

  // Explicit "Begin" gate: the scene doesn't auto-start until the user taps
  // Begin. That tap (a) is a clear start cue, and (b) is the user gesture iOS
  // Safari requires before the opening AI line's audio can play.
  const [armed, setArmed] = useState(false);
  const {
    isBlocked: isMicBlocked,
    isGranted: isMicGranted,
    status: micStatus,
    requestMic,
  } = useMicPermission({ recheckOnVisible: true });
  const [checkingMic, setCheckingMic] = useState(false);
  // loadSession fires rehearsal_started from a closure that would otherwise
  // capture whatever the permission state was on first render, which is usually
  // null while the Permissions API is still resolving.
  const micStatusRef = useRef<typeof micStatus>(micStatus);
  useEffect(() => { micStatusRef.current = micStatus; }, [micStatus]);

  /* ── Load session ──────────────────────────────────────────────── */

  const loadSession = async () => {
    if (!sessionId) return;
    // Reset all rehearsal state so "Run it again" starts fresh
    setSession(null);
    setSceneWithLines(null);
    setShowFeedback(false);
    setSessionFeedback(null);
    setFadeToReview(false);
    setActiveLineIndex(null);
    setLastAiLine(null);
    setFocusInitialized(false);
    setArmed(false);
    setGateChecked(false);
    autoStartedRef.current = false;
    autoBeganRef.current = false;
    beganWithoutGestureRef.current = false;
    lineAudioBlobsRef.current.clear();
    lineTranscriptsRef.current.clear();
    lineAttemptsRef.current.clear();
    replayBoundsRef.current.clear();
    setSessionDuration(0);
    // "Run it again" comes back through here, so a fresh run must be able to
    // report its own completion and its own first line.
    rehearsalCompletedRef.current = false;
    firstLineTrackedRef.current = false;
    try {
      const sceneCacheKey = `actorrise_scene_${sceneId}`;
      const sessionCacheKey = `actorrise_session_${sessionId}`;
      const cachedScene = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sceneCacheKey) : null;
      const cachedSession = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(sessionCacheKey) : null;

      const [sessionData, sceneRes] = await Promise.all([
        cachedSession
          ? Promise.resolve(JSON.parse(cachedSession) as RehearsalSession)
          : api.get<RehearsalSession>(`/api/scenes/rehearse/sessions/${sessionId}`).then(r => r.data),
        cachedScene
          ? Promise.resolve(null)
          : api.get<SceneWithLines>(`/api/scenes/${sceneId}`),
      ]);
      // Clear the one-time session cache entry (it was just for this load)
      try { if (cachedSession) sessionStorage.removeItem(sessionCacheKey); } catch { /* ignore */ }

      const data = sessionData;
      setSession(data);
      if (data.max_lines != null) {
        setLinesRemaining(Math.max(0, data.max_lines - (data.total_lines_delivered ?? 0)));
      }

      // Keyed on session id, not a plain boolean: loadSession can re-run for the
      // same session (the effect depends on prepDone as well as sessionId), but
      // "Run it again" mints a fresh session id and that IS a new rehearsal.
      if (rehearsalTrackedRef.current !== sessionId) {
        rehearsalTrackedRef.current = sessionId;
        trackRehearsalStarted({
          mode: 'scene',
          scene_id: sceneId,
          script_id: scriptId ?? undefined,
          cold_read: coldRead,
          mic_status: micStatusRef.current ?? 'unknown',
        });
      }

      try {
        let sceneData: SceneWithLines;
        if (cachedScene) {
          sceneData = JSON.parse(cachedScene);
        } else {
          sceneData = sceneRes!.data;
          try { sessionStorage.setItem(sceneCacheKey, JSON.stringify(sceneData)); } catch { /* quota */ }
        }
        setSceneWithLines(sceneData);
        // Eagerly preload first AI lines during loading screen so they're cached before countdown ends
        const voiceId = voiceParam || data.ai_voice_id || 'coral';

        // Build per-character voice map so each AI character gets a distinct voice
        // First try to load user-assigned voices from sessionStorage (set by edit page)
        const savedVoiceMap = (() => {
          try {
            const raw = sessionStorage.getItem(`actorrise_voice_map_${data.id}`);
            if (raw) {
              sessionStorage.removeItem(`actorrise_voice_map_${data.id}`);
              return JSON.parse(raw) as Record<string, { id: string; label: string; color: string } | string>;
            }
          } catch { /* ignore */ }
          return null;
        })();

        // Derived from sceneData, not the cueNames memo: setSceneWithLines above
        // hasn't re-rendered yet, so the memo is still the previous scene's list.
        const sceneCueNames = [...new Set(sceneData.lines.map(l => l.character_name))];
        const aiChars = sceneCueNames.filter(c => !isMyLine(data, c, sceneCueNames));
        const newVoiceMap = new Map<string, string>();
        const newMeta = new Map<string, { label: string; color: string }>();

        if (savedVoiceMap) {
          // Use user-assigned voices from the edit page (includes label + color metadata)
          for (const char of aiChars) {
            const entry = savedVoiceMap[char];
            if (entry && typeof entry === 'object') {
              newVoiceMap.set(char, entry.id);
              newMeta.set(char, { label: entry.label, color: entry.color });
            } else {
              newVoiceMap.set(char, (typeof entry === 'string' ? entry : null) ?? voiceId);
            }
          }
          setCharacterVoiceMeta(newMeta);
        } else {
          // Fallback: assign primary AI char the URL voice, cycle pool for the rest
          const voicePool = ['coral', 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'sage'];
          newVoiceMap.set(data.ai_character, voiceId);
          const remainingVoices = voicePool.filter(v => v !== voiceId);
          let vIdx = 0;
          for (const char of aiChars) {
            if (!newVoiceMap.has(char)) {
              newVoiceMap.set(char, remainingVoices[vIdx % remainingVoices.length]);
              vIdx++;
            }
          }
        }
        characterVoiceMapRef.current = newVoiceMap;

        sceneData.lines
          .filter(l => !isMyLine(data, l.character_name, sceneCueNames))
          .slice(0, 5)
          .forEach(l => preloadTTSRef.current(ttsText(l), newVoiceMap.get(l.character_name) ?? voiceId, ttsInstructions(l, sceneVoiceContextRef.current)));
      } catch {
        // Non-fatal
      }
      // Countdown is started by the explicit "Begin" tap (handleBegin), not here,
      // so the opening AI line plays from a user gesture (iOS autoplay) and the
      // user gets a clear start cue instead of a silent auto-start.
      setFocusInitialized(true);
    } catch (err) {
      // A load failure is a client error, not disinterest — record it so the
      // "51 abandoned at 2.1 lines" cohort can be split by cause.
      trackRehearsalError({
        mode: 'scene',
        stage: 'load',
        message: err instanceof Error ? err.message.slice(0, 120) : 'unknown',
      });
      setError('Session not found. Start a new rehearsal from the library or one of your scripts.');
    }
  };

  /** User tapped "Begin": unlock audio within the gesture, then arm the start. */
  const handleBegin = async () => {
    // Best-effort iOS audio unlock: a programmatic play() later is blocked unless
    // preceded by a user gesture. Play/pause the TTS element now while we have one.
    // This MUST stay first and synchronous — awaiting the mic before it spends
    // the gesture, and then the AI's voice never plays on iOS.
    try {
      const a = aiAudioRef.current;
      if (a) {
        a.muted = true;
        const p = a.play();
        if (p && typeof p.then === 'function') {
          p.then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
        }
      }
    } catch { /* ignore — the 14s self-heal auto-advance is the backstop */ }

    // Then settle the mic, before any line is spoken. 18 of the 35 actors who
    // ever entered a room never delivered a line, and none of them paid: a scene
    // that starts talking at someone whose mic was never granted is
    // indistinguishable from a product that does not work. Prewarming quietly on
    // load left the prompt easy to miss or ignore; asking on the tap does not.
    // A denial is not fatal — tap-to-advance still runs the scene — so this
    // never blocks the way in.
    if (!isMicGranted && !isMicBlocked) {
      setCheckingMic(true);
      try {
        await requestMic();
      } finally {
        setCheckingMic(false);
      }
    }

    // Start immediately. The Begin tap is the "get ready" moment, so an extra
    // countdown just delays the opening line and feels laggy. The first AI line
    // was preloaded during the load screen, so it plays right away.
    setCountdown(null);
    setArmed(true);
  };

  const loadFeedback = async () => {
    if (!session) return;
    try {
      const response = await api.get(`/api/scenes/rehearse/${session.id}/feedback`);
      setSessionFeedback(response.data);
    } catch (err) {
      console.error('Error loading feedback:', err);
    }
  };

  /* ── Effects ───────────────────────────────────────────────────── */

  // Detect newly connected mics and offer to switch
  useEffect(() => {
    const handler = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default');
        const newMic = mics.find(d => !knownMicIdsRef.current.has(d.deviceId));
        // Update known set
        mics.forEach(d => knownMicIdsRef.current.add(d.deviceId));
        if (!newMic || newMic.deviceId === selectedMicId) return;
        const label = newMic.label || 'New microphone';
        setMicSwitchToast({ deviceId: newMic.deviceId, label });
        if (micSwitchTimerRef.current) clearTimeout(micSwitchTimerRef.current);
        micSwitchTimerRef.current = setTimeout(() => setMicSwitchToast(null), 8000);
      } catch { /* ignore */ }
    };
    // Seed known mics on mount so first devicechange only fires for truly new devices
    navigator.mediaDevices?.enumerateDevices().then(devices => {
      devices.filter(d => d.kind === 'audioinput').forEach(d => knownMicIdsRef.current.add(d.deviceId));
    }).catch(() => {});
    navigator.mediaDevices?.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handler);
  }, [selectedMicId, setSelectedMicId]);

  /* ── Trial offers, on the way up ─────────────────────────────────── */
  // Asked when the product just worked, never when it refused. Both must sit
  // above the showFeedback early return so the hook order stays stable across
  // the switch into review.
  const linesDelivered = session?.total_lines_delivered ?? 0;
  const completionOffer = useTrialOffer('scene_completed', showFeedback);
  // Six lines is past the 3.1-line average, so this only reaches actors who are
  // genuinely in the scene rather than poking at it.
  const midSceneOffer = useTrialOffer('lines_delivered', !showFeedback && linesDelivered >= 6);

  // Kill audio & abandon session when user navigates away (back button, bfcache, client-side route)
  const showFeedbackRef = useRef(showFeedback);
  useEffect(() => { showFeedbackRef.current = showFeedback; }, [showFeedback]);

  useEffect(() => {
    const stop = () => { cancelAI(); window.speechSynthesis?.cancel(); };
    const abandonSession = () => {
      // Only abandon if session is still in progress (not completed)
      if (!sessionId || showFeedbackRef.current || rehearsalCompletedRef.current) return;

      // Where the run actually died. This is the number the activation work needs:
      // "3% reach /rehearse" was never the useful fact, "they quit 12% in, 40
      // seconds after loading" is. Sent before the fetch so it still goes out on
      // the pagehide path, where the tab may not survive long enough for much else.
      const lineIdx = activeLineIndexRef.current ?? 0;
      const lineCount = orderedLinesRef.current.length;
      trackRehearsalAbandoned({
        mode: 'scene',
        progress_pct: lineCount > 0 ? Math.round((lineIdx / lineCount) * 100) : 0,
        last_line_index: lineIdx,
        duration_seconds: Math.floor((Date.now() - sessionStartTimeRef.current) / 1000),
      });

      const token = getCachedAuthToken();
      if (!token) return;
      fetch(`${API_URL}/api/scenes/rehearse/${sessionId}/abandon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
        keepalive: true,
      }).catch(() => {});
    };
    const handlePageHide = () => { stop(); abandonSession(); };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      // Component unmount — kill all pending timers and audio, abandon session
      stop();
      abandonSession();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (srAdvanceTimerRef.current) clearTimeout(srAdvanceTimerRef.current);
      if (pendingAdvanceRef.current) clearTimeout(pendingAdvanceRef.current);
    };
  }, [cancelAI, sessionId]);

  // Initial load — in cold-read mode we hold until the prep read-through is done.
  useEffect(() => {
    if (sessionId && prepDone) loadSession();
    else if (!sessionId) setError('No active rehearsal. Pick a scene from the library or one of your scripts to begin.');
  }, [sessionId, prepDone]);

  // Countdown tick — 1 second per tick
  useEffect(() => {
    if (countdown === null || countdown < 0) return;
    if (countdown === 0) {
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown(c => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Pre-warm mic stream during countdown so first recording has no getUserMedia delay
  useEffect(() => {
    if (focusInitialized) prewarmStream();
  }, [focusInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Walk straight on stage when the browser lets us.
   *
   * Tapping Rehearse already said what you wanted; landing on a screen that
   * asks again is a door held shut in front of a room you asked to enter. On a
   * short scene the interstitial can outlast the run.
   *
   * It cannot simply be deleted. That screen is the user gesture iOS Safari
   * needs before the opening line's audio may play, and it is where someone
   * whose mic is blocked is told so. A gesture is only required until the grant
   * is remembered for the origin — so ask the browser whether the mic is
   * already granted, and hold the door only when the answer is no.
   *
   * One tap the first time and none after, except on Safari, which does not
   * implement the microphone permission descriptor: useMicPermission reports
   * 'prompt' there, so the gate stays, which is right — a run that silently
   * never hears you is a failure this app has shipped before.
   */
  useEffect(() => {
    if (autoBeganRef.current) return;
    if (!focusInitialized || armed || showFeedback || error) return;
    // null means the permission probe has not answered yet. Waiting is what
    // keeps the gate from flashing up in front of a scene we are about to start.
    if (micStatus === null) return;

    autoBeganRef.current = true;
    if (micStatus === 'granted') {
      beganWithoutGestureRef.current = true;
      void handleBegin();
    } else {
      setGateChecked(true);
    }
  }, [focusInitialized, armed, showFeedback, error, micStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Audio is playing, so the gesture question is settled for this run. */
  useEffect(() => {
    if (isSpeakingAI) beganWithoutGestureRef.current = false;
  }, [isSpeakingAI]);

  // Auto-start: begin from session.current_line_index (respects "Start from here")
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!armed) return;
    if (countdown !== null) return;
    if (paused) return;
    if (!focusInitialized || !session || !orderedLines.length) return;

    autoStartedRef.current = true;
    sessionStartTimeRef.current = Date.now();
    const startIdx = Math.min(session.current_line_index ?? 0, orderedLines.length - 1);
    setActiveLineIndex(startIdx);
    const firstLine = orderedLines[startIdx];

    if (!isMyLine(session, firstLine.character_name, cueNamesRef.current)) {
      setLastAiLine(firstLine.text);
      speakLineRef.current(ttsText(firstLine), ttsInstructions(firstLine, sceneVoiceContextRef.current), firstLine.character_name);
    } else {
      // User's line — auto-listen will handle
      setLastAiLine(null);
    }
  }, [armed, countdown, paused, focusInitialized, session?.id, orderedLines.length]);

  // Stable ref so the auto-listen timer always calls the latest startListening
  // without making it a dep (which re-fires the effect every time isListening changes)
  const startListeningRef = useRef(startListening);
  startListeningRef.current = startListening;

  // Auto-listen when it's user's turn
  useEffect(() => {
    const isUserTurn = currentUserLineText != null && lastAiLine == null;
    const canAutoListen =
      !showFeedback &&
      !paused &&
      isUserTurn &&
      isSpeechRecognitionSupported &&
      !isListening &&
      !isTranscribing &&
      !anySpeaking &&
      (countdown === null || countdown <= 0) &&
      activeUserLineKey !== null &&
      autoListenLineKey !== activeUserLineKey;
    if (!canAutoListen) return;

    setAutoListenLineKey(activeUserLineKey);
    gotResultRef.current = false;
    // Fire immediately — no delay needed since we gate on !anySpeaking
    startListeningRef.current();
  }, [
    showFeedback, paused, currentUserLineText, lastAiLine,
    isSpeechRecognitionSupported, isListening, isTranscribing, anySpeaking,
    countdown, activeUserLineKey, autoListenLineKey,
    // startListening intentionally omitted — accessed via startListeningRef
  ]);

  // No safety-net timeout — SR handles all line advances.
  // Recording runs until the user finishes the line (even long monologues).

  // Live word highlighting: run SpeechRecognition in parallel while Whisper records
  useEffect(() => {
    if (!isListening || !currentUserLineText) {
      setLiveMatchedIndices(new Set());
      bestMatchedRef.current = new Set();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const expected = stripStageDirections(currentUserLineText);
    const expectedWords = tokenize(expected);

    // Kill any lingering SR instance from a previous line
    if (liveRecognitionRef.current) {
      try { liveRecognitionRef.current.onend = () => {}; liveRecognitionRef.current.stop(); } catch {}
      liveRecognitionRef.current = null;
    }

    let recognition: any;
    try {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        // Interim results, deliberately. Waiting for `isFinal` costs 500–800ms,
        // which is most of the gap an actor feels between their last syllable
        // and the next line.
        let fullTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript + ' ';
        }

        const matched = alignWords(expectedWords, tokenize(fullTranscript));

        // Merge into best-seen set — prevents SR regressions from un-highlighting words
        matched.forEach(i => bestMatchedRef.current.add(i));
        setLiveMatchedIndices(new Set(bestMatchedRef.current));

        // Words are landing, so whatever failed earlier has recovered. Clear the
        // warning rather than leaving a permanent "I can't hear you" over a
        // session that is plainly working.
        setSpeechError(prev => (prev ? null : prev));

        // Open Whisper gate once SR has matched enough sequential words
        const gateThreshold = Math.min(3, expectedWords.length);
        if (bestMatchedRef.current.size >= gateThreshold) whisperGateRef.current = true;

        // Hand the current read to the advance watcher below. Nothing advances
        // from inside onresult any more — that fired on word count alone, which
        // is how an actor got cut off two words into a thirty-word speech.
        liveReadRef.current = { transcript: fullTranscript.trim(), matched: new Set(bestMatchedRef.current) };
      };
      let alive = true; // flipped in cleanup to prevent restarts after unmount
      recognition.onerror = (ev: any) => {
        // Fatal errors — don't attempt restart.
        if (ev.error === 'not-allowed' || ev.error === 'service-not-available') {
          alive = false;
          // This used to stop here, silently, and it is the most likely reason
          // 70% of mobile rehearsals never reach a single spoken line: the actor
          // is left looking at a scene that will never advance, with nothing
          // saying why. The `isSupported` guard above does not catch it — iOS
          // Safari *does* expose webkitSpeechRecognition, it just fails at
          // runtime when Apple's speech service refuses or an in-app browser
          // blocks it. So say it out loud and point at the way forward.
          setSpeechError(ev.error === 'not-allowed' ? 'mic-blocked' : 'unavailable');
          trackRehearsalError({ mode: 'scene', stage: 'speech', message: ev.error });
        }
      };
      recognition.onend = () => {
        // Chrome kills continuous SR after silence / timeout — auto-restart
        if (alive && !srAdvancedRef.current) {
          try { recognition.start(); } catch { alive = false; }
        }
      };
      recognition.start();
      liveRecognitionRef.current = recognition;
    } catch {
      // SpeechRecognition unavailable or conflicted — graceful degradation
    }

    // The advance watcher.
    //
    // Polls rather than reacting to recognition events, because the thing being
    // waited on is the actor *stopping*, and silence produces no events. The
    // microphone knows within a frame; recognition takes the better part of a
    // second. See lib/advance-rule.ts for the rule itself.
    const watcher = setInterval(() => {
      if (srAdvancedRef.current) return;
      const read = liveReadRef.current;
      const score = expectedWords.length > 0 ? read.matched.size / expectedWords.length : 1;
      const lastWordMatched = expectedWords.length > 0 && read.matched.has(expectedWords.length - 1);

      if (!shouldAdvance({
        msSinceVoice: msSinceVoice(),
        score,
        lastWordMatched,
        heardAnySpeech: heardAnySpeech(),
      })) return;

      srAdvancedRef.current = true;
      try { recognition?.stop(); liveRecognitionRef.current = null; } catch {}
      cancelTranscriptionRef.current();

      const wordResult = expectedWords.map((w, i) => ({ word: w, matched: read.matched.has(i) }));
      setLiveMatchedIndices(new Set()); // wordMatchResult takes over
      setWordMatchResult({ words: wordResult, willAdvance: true });

      // One frame, so the completed line paints before it moves. Not a delay —
      // the old 400ms timer here was a third of the perceived lag.
      requestAnimationFrame(() => handleDeliverLineRef.current(read.transcript));
    }, WATCHER_INTERVAL_MS);

    return () => {
      clearInterval(watcher);
      try {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (liveRecognitionRef.current) {
          // Prevent onend from restarting
          liveRecognitionRef.current.onend = () => {};
          liveRecognitionRef.current.stop();
        }
      } catch {}
      liveRecognitionRef.current = null;
      setLiveMatchedIndices(new Set());
    };
  }, [isListening]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear word match feedback whenever we move to a new line
  useEffect(() => {
    if (pendingAdvanceRef.current) {
      clearTimeout(pendingAdvanceRef.current);
      pendingAdvanceRef.current = null;
    }
    if (pendingRetryRef.current) {
      clearTimeout(pendingRetryRef.current);
      pendingRetryRef.current = null;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    srAdvancedRef.current = false;
    whisperGateRef.current = false;
    liveReadRef.current = { transcript: '', matched: new Set() };
    lastDeliveredIndexRef.current = null;
    setWordMatchResult(null);
    setSpeechError(null);
    setShouldShake(false);
    setToast(null);
  }, [activeLineIndex]);

  // Bulk preload: cache first several AI lines when scene loads
  const bulkPreloadedRef = useRef(false);
  useEffect(() => {
    if (bulkPreloadedRef.current || !session || !orderedLines.length) return;
    bulkPreloadedRef.current = true;
    const aiLines = orderedLines
      .filter(l => !isMyLine(session, l.character_name, cueNamesRef.current))
      .slice(0, 8); // preload first 8 AI lines
    aiLines.forEach(l => preloadTTS(ttsText(l), characterVoiceMapRef.current.get(l.character_name) ?? lastKnownVoiceIdRef.current, ttsInstructions(l, sceneVoiceContextRef.current)));
  }, [session?.ai_character, orderedLines, preloadTTS]);

  // Preload next AI line while user speaks
  useEffect(() => {
    if (!session || activeLineIndex == null || !orderedLines.length) return;
    const currentLine = orderedLines[activeLineIndex];
    if (!currentLine || !isMyLine(session, currentLine.character_name, cueNamesRef.current)) return;

    // Preload next 2 AI lines ahead
    let found = 0;
    for (let i = activeLineIndex + 1; i < orderedLines.length && found < 3; i++) {
      const l = orderedLines[i];
      if (!isMyLine(session, l.character_name, cueNamesRef.current)) {
        preloadTTS(ttsText(l), characterVoiceMapRef.current.get(l.character_name) ?? lastKnownVoiceIdRef.current, ttsInstructions(l, sceneVoiceContextRef.current));
        found++;
      }
    }
  }, [activeLineIndex, orderedLines, session?.user_character, session?.ai_character, preloadTTS]);

  // Scroll to keep active line centered in the scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeLineIndex == null) return;
    // Use rAF to ensure DOM has committed the ref/data-attr update after render
    const raf = requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      // Find element by data attribute — avoids ref timing issues with motion.div
      const el = container.querySelector<HTMLElement>(`[data-line-index="${activeLineIndex}"]`);
      if (!el) return;
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const absoluteTop = container.scrollTop + (elRect.top - containerRect.top);
      const target = absoluteTop - container.clientHeight / 2 + el.offsetHeight / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeLineIndex]);


  // Detect speech while paused — slide-in toast to remind user to resume
  const pausedSpeechShownRef = useRef(false);
  const [pausedSpeechToast, setPausedSpeechToast] = useState(false);
  useEffect(() => {
    if (!paused) { pausedSpeechShownRef.current = false; setPausedSpeechToast(false); return; }
    if (pausedSpeechShownRef.current) return;
    const stream = whisperStreamRef.current;
    if (!stream || !stream.active) return;
    let ctx: AudioContext | null = whisperAudioCtxRef.current;
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;
    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
    } catch { return; }
    const buf = new Uint8Array(analyser.frequencyBinCount);
    let hits = 0;
    const iv = setInterval(() => {
      if (pausedSpeechShownRef.current) { clearInterval(iv); source.disconnect(); return; }
      analyser.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
      if (avg > 8) hits++; else hits = 0;
      if (hits >= 3) {
        pausedSpeechShownRef.current = true;
        setPausedSpeechToast(true);
        setTimeout(() => setPausedSpeechToast(false), 5000);
        clearInterval(iv);
        source.disconnect();
      }
    }, 300);
    return () => { clearInterval(iv); try { source.disconnect(); } catch {} };
  }, [paused]);

  // Skip-if-silent timer
  useEffect(() => {
    if (!session || !rehearsalSettings.skipMyLineIfSilent || !currentUserLineText || isProcessing || lastAiLine != null) return;
    if (countdown !== null && countdown > 0) return;
    const sec = rehearsalSettings.skipAfterSeconds * 1000;
    skipSilentTimerRef.current = setTimeout(() => {
      skipSilentTimerRef.current = null;
      handleDeliverLine(currentUserLineText);
    }, sec);
    return () => {
      if (skipSilentTimerRef.current) {
        clearTimeout(skipSilentTimerRef.current);
        skipSilentTimerRef.current = null;
      }
    };
  }, [session?.id, rehearsalSettings.skipMyLineIfSilent, rehearsalSettings.skipAfterSeconds, currentUserLineText, countdown, isProcessing, lastAiLine]);

  // Cycle whimsical loading texts
  const hasSession = session !== null;
  useEffect(() => {
    if (hasSession) return;
    const t = setInterval(() => setLoadingTextIdx(i => (i + 1) % LOADING_TEXTS.length), 2500);
    return () => clearInterval(t);
  }, [hasSession]);

  /* ── Controls ──────────────────────────────────────────────────── */

  const stopAllAudio = useCallback(() => {
    cancelAI();
    window.speechSynthesis?.cancel();
    cancelTranscription();
    stopListening(); // unconditional — isListening state can be stale
    // Also abort live SR recognition so it can't fire a final result after pause
    if (liveRecognitionRef.current) {
      try { liveRecognitionRef.current.onend = () => {}; liveRecognitionRef.current.abort(); } catch {}
      liveRecognitionRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    if (srAdvanceTimerRef.current) {
      clearTimeout(srAdvanceTimerRef.current);
      srAdvanceTimerRef.current = null;
    }
    if (pendingAdvanceRef.current) {
      clearTimeout(pendingAdvanceRef.current);
      pendingAdvanceRef.current = null;
    }
  }, [cancelAI, cancelTranscription, stopListening]);
  const stopAllAudioRef = useRef(stopAllAudio);
  stopAllAudioRef.current = stopAllAudio;

  const handleExit = useCallback(() => {
    stopAllAudio();
    setExiting(true); // immediately fade out UI
    router.replace(backUrl);
  }, [stopAllAudio, router, backUrl]);

  const handlePause = useCallback(() => {
    setPaused(true);
    setShowPausePlayOverlay('pause');
    setTimeout(() => setShowPausePlayOverlay(null), 700);
    stopAllAudio();
  }, [stopAllAudio]);

  const handleResume = useCallback(() => {
    setPaused(false);
    setShowPausePlayOverlay('play');
    setTimeout(() => setShowPausePlayOverlay(null), 700);
    setAutoListenLineKey(null); // Force auto-listen to re-trigger
    // Use refs for latest state — avoids stale closures
    const idx = activeLineIndexRef.current;
    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    if (idx != null && sess) {
      const line = lines[idx];
      if (line && !isMyLine(sess, line.character_name, cueNamesRef.current)) {
        setLastAiLine(line.text);
        speakLineRef.current(ttsText(line), ttsInstructions(line, sceneVoiceContextRef.current), line.character_name);
      }
    }
  }, []);

  const handleRestart = useCallback(() => {
    if (!session || isRestarting) return;
    setIsRestarting(true);
    stopSceneReplayRef.current();
    stopAllAudio();

    // ── Instantly reset all UI — user sees countdown immediately ──
    setShowFeedback(false);
    setSessionFeedback(null);
    setFadeToReview(false);
    lineAudioBlobsRef.current.clear();
    lineTranscriptsRef.current.clear();
    lineAttemptsRef.current.clear();
    replayBoundsRef.current.clear();
    setPlayingLineIdx(null);
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause();
      if (reviewAudioUrlRef.current) URL.revokeObjectURL(reviewAudioUrlRef.current);
      reviewAudioRef.current = null;
      reviewAudioUrlRef.current = null;
    }
    setActiveLineIndex(null);
    setLastAiLine(null);
    setAutoListenLineKey(null);
    autoStartedRef.current = false;
    bulkPreloadedRef.current = false;
    sessionStartTimeRef.current = Date.now();
    bestMatchedRef.current = new Set();
    setWordMatchResult(null);
    setLiveMatchedIndices(new Set());
    setPaused(false);
    setError(null);

    // Reset the current session to line 0 so auto-start begins from the top
    setSession(prev => prev ? { ...prev, current_line_index: 0 } : prev);

    // Briefly toggle focusInitialized to re-trigger the auto-start effect
    setFocusInitialized(false);

    // Trigger countdown immediately (before API responds)
    const countdownSec = rehearsalSettings.countdownSeconds;
    if (countdownSec && countdownSec > 0) {
      setCountdown(countdownSec);
    } else {
      setCountdown(null);
    }
    // Re-enable on next tick so the auto-start effect sees the false→true transition
    requestAnimationFrame(() => setFocusInitialized(true));
    setIsRestarting(false);

    // ── Fire API in background — session data arrives silently ──
    api.post<{ id: number } & Record<string, unknown>>('/api/scenes/rehearse/start', {
      scene_id: session.scene_id,
      user_character: session.user_character,
    }).then(({ data }) => {
      try { sessionStorage.setItem(`actorrise_session_${data.id}`, JSON.stringify(data)); } catch {}
      const vp = lastKnownVoiceIdRef.current !== 'coral' ? `&voice=${lastKnownVoiceIdRef.current}` : '';
      window.history.replaceState(null, '', `/scenes/${session.scene_id}/rehearse?session=${data.id}&script=${scriptId}${vp}`);
      setSession(data as any);
    }).catch(() => {
      setError('Failed to create new session. Please try again.');
    });
  }, [session, isRestarting, stopAllAudio, scriptId, rehearsalSettings.countdownSeconds]);

  const handleJumpToLine = useCallback((lineIndex: number) => {
    if (!sessionRef.current) return;
    stopAllAudio();
    setAutoListenLineKey(null);
    setPaused(false);
    advanceScriptRef.current(lineIndex);
  }, [stopAllAudio]);

  // Manual tap-to-advance: if speech recognition fails, user can tap their line
  /**
   * Speech is not going to carry this session — either the API is missing, or
   * it threw a fatal error at runtime. Both mean the actor must tap to advance,
   * so both need to say so.
   */
  const speechIsBroken = !isSpeechRecognitionSupported || speechError !== null;

  const handleManualAdvance = useCallback(() => {
    if (!currentUserLineText || isProcessing) return;
    if (isListening) stopListening();
    handleDeliverLine(currentUserLineText);
  }, [currentUserLineText, isProcessing, isListening, stopListening]);

  /* ── Go back to previous line ───────────────────────────────────── */

  const handleGoBack = useCallback(() => {
    const idx = activeLineIndexRef.current;
    if (idx == null || idx <= 0) return;
    if (isListening) stopListening();
    cancelTranscription();
    setWordMatchResult(null);
    setLiveMatchedIndices(new Set());
    bestMatchedRef.current = new Set();
    srAdvancedRef.current = false;
    advanceScriptRef.current(idx - 1);
  }, [isListening, stopListening, cancelTranscription]);

  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  /* ── Keyboard shortcuts ─────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (paused) handleResume();
        else handlePause();
      } else if (e.code === 'Enter' && e.shiftKey) {
        e.preventDefault();
        handleGoBack();
      } else if (e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Skip current line — works for both user and AI turns
        if (currentUserLineText && !isProcessing) {
          handleManualAdvance();
        } else if (activeLineIndexRef.current != null) {
          stopAllAudio();
          advanceScriptRef.current(activeLineIndexRef.current + 1);
        }
      } else if (e.key === '?') {
        setShowShortcutsModal(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paused, handlePause, handleResume, handleGoBack, handleManualAdvance, stopAllAudio, currentUserLineText, isProcessing]);

  /* ── Derived state ─────────────────────────────────────────────── */

  const isUserTurn = currentUserLineText != null && lastAiLine == null;

  // Build a live WordMatchResult from SpeechRecognition interim results
  const liveWordResult: WordMatchResult | null = (() => {
    if (!isListening || liveMatchedIndices.size === 0 || !currentUserLineText) return null;
    const expected = stripStageDirections(currentUserLineText);
    const words = tokenize(expected)
      .map((word, i) => ({ word, matched: liveMatchedIndices.has(i) }));
    return { words, willAdvance: true };
  })();

  const statusInfo = (() => {
    if (isLoadingAI) return { text: 'Generating voice', color: 'bg-amber-400', pulse: true };
    if (anySpeaking) return { text: `${session?.ai_character ?? 'Partner'} speaking`, color: 'bg-amber-400', pulse: true };
    if (isTranscribing) return { text: 'Transcribing', color: 'bg-blue-400', pulse: true };
    if (isListening) return { text: 'Recording', color: 'bg-green-400', pulse: true };
    if (isProcessing) return { text: 'Processing', color: 'bg-blue-400', pulse: true };
    if (isUserTurn) return { text: 'Your turn', color: 'bg-orange-400', pulse: false };
    return { text: 'Waiting', color: 'bg-neutral-500', pulse: false };
  })();

  /* ── Session review helpers ───────────────────────────────────── */

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const playLineAudio = useCallback((lineIdx: number, speechStartRatio = 0, speechEndRatio = 1) => {
    const blob = lineAudioBlobsRef.current.get(lineIdx);
    if (!blob) return;

    // Tapping a single line stops a continuous replay if one is running.
    if (replayActiveRef.current) stopSceneReplayRef.current();

    // Stop any currently playing audio
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause();
      if (reviewAudioUrlRef.current) URL.revokeObjectURL(reviewAudioUrlRef.current);
    }

    // If tapping the same line that's playing, just stop
    if (playingLineIdx === lineIdx) {
      reviewAudioRef.current = null;
      reviewAudioUrlRef.current = null;
      setPlayingLineIdx(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    reviewAudioRef.current = audio;
    reviewAudioUrlRef.current = url;
    setPlayingLineIdx(lineIdx);
    audio.onended = () => {
      setPlayingLineIdx(null);
      URL.revokeObjectURL(url);
      reviewAudioRef.current = null;
      reviewAudioUrlRef.current = null;
    };
    // Seek past leading silence once metadata loads
    if (speechStartRatio > 0) {
      audio.onloadedmetadata = () => {
        const dur = audio.duration;
        if (isFinite(dur) && dur > 0) {
          audio.currentTime = speechStartRatio * dur;
        }
        audio.play();
      };
      audio.load();
    } else {
      audio.play();
    }
  }, [playingLineIdx]);

  // Cleanup review audio on unmount
  useEffect(() => {
    return () => {
      if (reviewAudioRef.current) {
        reviewAudioRef.current.pause();
        if (reviewAudioUrlRef.current) URL.revokeObjectURL(reviewAudioUrlRef.current);
      }
    };
  }, []);

  /* ── Continuous scene replay: play the whole scene as one take ──── */

  const stopSceneReplay = useCallback(() => {
    replayActiveRef.current = false;
    replayIndexRef.current = null;
    setSceneReplayIdx(null);
    if (replayTrimTimerRef.current) { clearTimeout(replayTrimTimerRef.current); replayTrimTimerRef.current = null; }
    cancelReplayAI();
    const a = replayUserAudioRef.current;
    if (a) { a.onended = null; a.onerror = null; a.onloadedmetadata = null; try { a.pause(); } catch { /* noop */ } }
    if (replayUserUrlRef.current) { URL.revokeObjectURL(replayUserUrlRef.current); replayUserUrlRef.current = null; }
  }, [cancelReplayAI]);
  stopSceneReplayRef.current = stopSceneReplay;

  // Play one user-recorded line, then chain to the next segment. Trims leading
  // and trailing silence using decoded bounds so the take stays tight.
  const playReplayUserBlob = useCallback((idx: number, blob: Blob) => {
    const a = replayUserAudioRef.current;
    if (!a) { advanceReplayRef.current(); return; }
    if (replayUserUrlRef.current) URL.revokeObjectURL(replayUserUrlRef.current);
    const url = URL.createObjectURL(blob);
    replayUserUrlRef.current = url;
    a.src = url;
    a.onerror = () => advanceReplayRef.current();
    const bounds = replayBoundsRef.current.get(idx);
    if (bounds) {
      a.onended = null;
      a.onloadedmetadata = () => {
        const dur = isFinite(a.duration) && a.duration > 0 ? a.duration : 0;
        if (dur > 0) a.currentTime = bounds.startRatio * dur;
        a.play().catch(() => advanceReplayRef.current());
        const playMs = dur > 0 ? Math.max(150, (bounds.endRatio - bounds.startRatio) * dur * 1000) : 1500;
        if (replayTrimTimerRef.current) clearTimeout(replayTrimTimerRef.current);
        // +140ms is a small natural beat between lines before the next one starts.
        replayTrimTimerRef.current = setTimeout(() => { replayTrimTimerRef.current = null; advanceReplayRef.current(); }, playMs + 140);
      };
      a.load();
    } else {
      a.onended = () => advanceReplayRef.current();
      a.play().catch(() => advanceReplayRef.current());
    }
  }, []);

  const advanceReplay = useCallback(() => {
    if (!replayActiveRef.current) return;
    // Clear the previous segment's handlers/audio so nothing double-fires or overlaps.
    if (replayTrimTimerRef.current) { clearTimeout(replayTrimTimerRef.current); replayTrimTimerRef.current = null; }
    cancelReplayAI();
    const ua = replayUserAudioRef.current;
    if (ua) { ua.onended = null; ua.onerror = null; ua.onloadedmetadata = null; try { ua.pause(); } catch { /* noop */ } }
    if (replayUserUrlRef.current) { URL.revokeObjectURL(replayUserUrlRef.current); replayUserUrlRef.current = null; }

    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    let idx = (replayIndexRef.current ?? -1) + 1;
    // Skip user lines that were never delivered — there's no recording to play.
    while (idx < lines.length) {
      const line = lines[idx];
      const isUser = !!sess && isMyLine(sess, line.character_name, cueNamesRef.current);
      if (isUser && !lineAudioBlobsRef.current.get(idx)) { idx++; continue; }
      break;
    }
    if (idx >= lines.length) { stopSceneReplay(); return; }
    replayIndexRef.current = idx;
    setSceneReplayIdx(idx);
    const line = lines[idx];
    const isUser = !!sess && isMyLine(sess, line.character_name, cueNamesRef.current);
    if (isUser) {
      playReplayUserBlob(idx, lineAudioBlobsRef.current.get(idx)!);
    } else {
      const voiceId = characterVoiceMapRef.current.get(line.character_name) ?? lastKnownVoiceIdRef.current;
      speakReplayAI(ttsText(line), voiceId, ttsInstructions(line, sceneVoiceContextRef.current));
    }
  }, [playReplayUserBlob, speakReplayAI, cancelReplayAI, stopSceneReplay]);
  advanceReplayRef.current = advanceReplay;

  const startSceneReplay = useCallback(() => {
    if (!replayUserAudioRef.current) {
      const a = new Audio();
      a.preload = 'auto';
      replayUserAudioRef.current = a;
    }
    // Unlock audio for iOS within this tap gesture: a muted silent blip on the
    // user-line element, plus unlocking the AI-line element.
    const a = replayUserAudioRef.current;
    try {
      a.muted = true;
      a.src = silentWavUrl();
      const p = a.play();
      if (p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>).then(() => { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } a.muted = false; }).catch(() => { a.muted = false; });
      } else { a.muted = false; }
    } catch { a.muted = false; }
    unlockReplayAI();
    // Stop any single-line playback first.
    if (reviewAudioRef.current) { try { reviewAudioRef.current.pause(); } catch { /* noop */ } }
    setPlayingLineIdx(null);
    replayActiveRef.current = true;
    replayIndexRef.current = -1;
    advanceReplay();
  }, [advanceReplay, unlockReplayAI]);

  // Keep the currently-playing line in view during replay.
  useEffect(() => {
    if (sceneReplayIdx == null) return;
    document.getElementById(`review-line-${sceneReplayIdx}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [sceneReplayIdx]);

  // Tear down replay on unmount.
  useEffect(() => {
    return () => {
      replayActiveRef.current = false;
      if (replayTrimTimerRef.current) clearTimeout(replayTrimTimerRef.current);
      const a = replayUserAudioRef.current;
      if (a) { try { a.pause(); } catch { /* noop */ } a.src = ''; }
      if (replayUserUrlRef.current) URL.revokeObjectURL(replayUserUrlRef.current);
    };
  }, []);

  /* ── Render: loading ───────────────────────────────────────────── */

  if (!session) {
    // Cold read: show the timed read-through first, then load + perform.
    if (coldRead && !prepDone && sessionId) {
      return (
        <ColdReadPrep
          sceneId={sceneId}
          userCharacter={coldReadCharacter}
          onReady={() => setPrepDone(true)}
        />
      );
    }
    return (
      <div className={cn("fixed inset-0 flex items-center justify-center", STAGE_SURFACE)}>
        <div className="text-center space-y-4">
          {error ? (
            <>
              <p className={cn("text-sm max-w-xs", STAGE_INK_SOFT)}>{error}</p>
              <Button size="sm" variant="outline" className={cn(STAGE_RULE)} onClick={() => router.push(backUrl)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {scriptId ? 'Back to script' : 'Back'}
              </Button>
            </>
          ) : (
            <>
              <div className={cn("h-8 w-8 rounded-full border-2 border-t-primary animate-spin mx-auto", STAGE_RULE)} />
              <motion.p
                key={loadingTextIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={cn("text-sm", STAGE_INK_SOFT)}
              >
                {LOADING_TEXTS[loadingTextIdx]}
              </motion.p>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── Render: feedback ──────────────────────────────────────────── */

  if (showFeedback) {
    const sceneTitle = sceneWithLines?.title || '';
    const playTitle = sceneWithLines?.play_title || '';
    const showPlayTitle = playTitle && playTitle.toLowerCase() !== sceneTitle.toLowerCase();

    return (
      <div className={cn("fixed inset-0 flex flex-col z-[10050]", STAGE_SURFACE)}>
        <div className="flex-1 overflow-auto flex justify-center px-4 pt-10 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl space-y-6"
          >
            {/* Header */}
            <div className="text-center space-y-2">
              <p className={cn("text-sm uppercase tracking-widest font-medium", STAGE_INK_FAINT)}>Scene Complete</p>
              <h1 className={cn("text-2xl font-bold", STAGE_INK)}>{sceneTitle}</h1>
              {showPlayTitle && (
                <p className={cn("text-sm", STAGE_INK_FAINT)}>from {playTitle}</p>
              )}
            </div>

            {/* One next step, never two. The trial offer wins when it is live,
                because the step it asks for (run your OWN sides) is the same
                step, and it is the one an actor has just earned the taste of. */}
            {completionOffer.visible ? (
              <TrialOfferCard
                headline={firstRun ? 'That was your first scene.' : 'Nice run.'}
                body="That was my script though, not yours. Upload your own sides and run them the same way, with the same partner."
                href={completionOffer.href}
                onAccept={completionOffer.accept}
                onDismiss={completionOffer.dismiss}
              />
            ) : (
              firstRun && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-5 text-center space-y-3">
                  <p className={cn("text-base font-semibold", STAGE_INK)}>
                    That was your first scene.
                  </p>
                  <p className={cn("text-sm", STAGE_INK_SOFT)}>
                    Now bring in something that&apos;s actually yours and run it the
                    same way.
                  </p>
                  <Button
                    onClick={() => router.push('/practice')}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Bring in your own sides
                  </Button>
                </div>
              )
            )}

            {/* How long the run took, and nothing else.
                There used to be a completion and an accuracy percentage here.
                Both were word-match scores against a speech-to-text transcript,
                which measures the microphone, not the performance — an actor who
                delivered a line beautifully and got misheard was shown 40%. */}
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <span>{formatDuration(sessionDuration)}</span>
            </div>

            {/* Play the whole scene back as one continuous take */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={sceneReplayIdx !== null ? stopSceneReplay : startSceneReplay}
                className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {sceneReplayIdx !== null
                  ? (<><Square className="w-3.5 h-3.5 fill-current" /> Stop replay</>)
                  : (<><Play className="w-4 h-4 fill-current" /> Play the whole scene</>)}
              </button>
            </div>

            {/* Divider */}
            <div className={cn("border-t", STAGE_RULE)} />

            {/* Transcript: line-by-line breakdown */}
            <div className="space-y-5">
              <p className={cn("text-xs uppercase tracking-widest font-semibold", STAGE_INK_FAINT)}>Your Performance</p>

              <div className="space-y-3">
                {orderedLines.map((line, idx) => {
                  const isUserLine = isMyLine(session, line.character_name, cueNamesRef.current);
                  const userTranscript = lineTranscriptsRef.current.get(idx);
                  const audioBlob = lineAudioBlobsRef.current.get(idx);
                  const wasDelivered = isUserLine && userTranscript;

                  if (!isUserLine) {
                    // AI lines: compact, muted
                    const meta = characterVoiceMeta.get(line.character_name);
                    return (
                      <div
                        key={line.id}
                        id={`review-line-${idx}`}
                        className={cn(
                          "space-y-0.5 pl-2 -ml-2 border-l-2 transition-colors",
                          sceneReplayIdx === idx ? "border-primary bg-primary/5" : "border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className={cn("w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[8px] font-bold text-white", meta?.color ?? 'bg-neutral-500')}>
                            {(meta?.label ?? line.character_name).charAt(0).toUpperCase()}
                          </div>
                          {/* The partner's lines sit a step back from yours in
                              both themes: lighter than the page in dark, greyer
                              than the page in light. */}
                          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-600">
                            {line.character_name}
                          </span>
                        </div>
                        <p className={cn("text-sm leading-snug", STAGE_INK_FAINT)}>
                          {renderTextWithStageDirections(line.text)}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={line.id}
                      id={`review-line-${idx}`}
                      className={cn(
                        "pl-3 border-l space-y-1 transition-colors",
                        sceneReplayIdx === idx ? "border-primary bg-primary/5" : STAGE_RULE
                      )}
                    >
                      {/* Character name. No per-line score and no "skipped" label:
                          a red 40% on a line you delivered well is the app
                          confidently reporting its own hearing as your work. */}
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-bold uppercase tracking-widest", STAGE_INK_SOFT)}>
                          {line.character_name}
                        </span>
                      </div>

                      {/* Expected text */}
                      <p className={cn(
                        "text-[15px] leading-snug",
                        wasDelivered ? STAGE_INK : STAGE_INK_FAINT
                      )}>
                        {renderTextWithStageDirections(line.text)}
                      </p>

                      {/* Waveform + transcript */}
                      {wasDelivered && (
                        <>
                          {audioBlob && (
                            <LineWaveformPlayer
                              blob={audioBlob}
                              isPlaying={playingLineIdx === idx}
                              audioRef={reviewAudioRef}
                              onToggle={(speechStartRatio, speechEndRatio) => playLineAudio(idx, speechStartRatio, speechEndRatio)}
                              onBounds={(speechStartRatio, speechEndRatio) => replayBoundsRef.current.set(idx, { startRatio: speechStartRatio, endRatio: speechEndRatio })}
                            />
                          )}
                          <p className={cn("text-xs italic leading-snug", STAGE_INK_FAINT)}>{userTranscript}</p>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Sticky bottom actions */}
        {/* The fade under the actions has to be the room's own colour, or it is
            a dark smear across the bottom of a cream page. */}
        <div className="shrink-0 px-4 pb-5 pt-3 bg-gradient-to-t from-[#f2ece2] via-[#f2ece2] to-[#f2ece2]/0 dark:from-[#191410] dark:via-[#191410] dark:to-[#191410]/0">
          <div className="max-w-3xl mx-auto flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleExit}
              className={cn("text-sm transition-colors flex items-center gap-1.5 hover:text-neutral-900 dark:hover:text-neutral-100", STAGE_INK_FAINT)}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Script
            </button>
            {/* Cold read is one take — no restarts. */}
            {!coldRead && (
              <>
                <span className="text-neutral-300 dark:text-neutral-700">·</span>
                <button
                  type="button"
                  onClick={handleRestart}
                  disabled={isRestarting}
                  className={cn("text-sm transition-colors disabled:opacity-50 hover:text-neutral-900 dark:hover:text-neutral-100", STAGE_INK_SOFT)}
                >
                  {isRestarting ? 'Starting...' : 'Run It Again'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: main rehearsal view ───────────────────────────────── */

  return (
    <div className={cn('fixed inset-0 flex flex-col z-[10050] transition-opacity duration-150', STAGE_SURFACE, exiting && 'opacity-0')}>
      {/* Fade-to-review overlay */}
      {fadeToReview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className={cn("absolute inset-0 z-40", STAGE_BG)}
        />
      )}
      {/* Loading cover */}
      {(!focusInitialized || (countdown !== null && countdown > 0)) && (
        <div className={cn("absolute inset-0 z-20 flex items-center justify-center", STAGE_BG)}>
          {!focusInitialized && (
            <div className={cn("h-8 w-8 rounded-full border-2 border-t-primary animate-spin", STAGE_RULE)} />
          )}
        </div>
      )}

      {/* Begin gate — the user gesture iOS needs, shown only when the mic probe
          says we have not been granted the microphone yet, or when autoplay
          turned the opening line down. Otherwise we go straight on stage. */}
      <AnimatePresence>
        {focusInitialized && gateChecked && !armed && !showFeedback && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className={cn("fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6 text-center", STAGE_SURFACE)}
          >
            {sceneWithLines && (
              <div className="max-w-md">
                <p className={cn("text-xs uppercase tracking-widest", STAGE_INK_FAINT)}>Ready to rehearse</p>
                <h2 className={cn("mt-2 text-2xl font-semibold", STAGE_INK)}>{sceneWithLines.title}</h2>
                {session && (
                  <p className={cn("mt-1 text-sm", STAGE_INK_SOFT)}>
                    You&apos;re playing <span className={cn("font-medium", STAGE_INK)}>{sessionRoles(session).join(' + ')}</span>
                  </p>
                )}
              </div>
            )}
            <Button
              onClick={handleBegin}
              disabled={checkingMic}
              className="min-h-[52px] px-8 text-base"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <Play className="mr-2 h-5 w-5" />
              {checkingMic ? 'Checking your mic…' : 'Begin scene'}
            </Button>
            {/* Say which scene we are in. Promising "just speak" to someone whose
                mic is blocked is how a silent room reads as a broken product. */}
            {isMicBlocked ? (
              <div className="max-w-xs space-y-2">
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Your mic is blocked, so I won&apos;t hear you.
                </p>
                <p className={cn("text-xs", STAGE_INK_FAINT)}>
                  Allow the mic in your browser&apos;s address bar, or start anyway and tap
                  to move through the scene.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={requestMic}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  Try the mic again
                </Button>
              </div>
            ) : (
              <p className={cn("max-w-xs text-xs", STAGE_INK_FAINT)}>
                {micStatus === 'granted'
                  ? 'Your scene partner reads their lines aloud. When it’s your turn, just speak.'
                  : 'Your scene partner reads their lines aloud. I’ll ask for your mic so I can hear your lines.'}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className={cn("fixed inset-0 flex items-center justify-center z-30", STAGE_SURFACE)}
          >
            <motion.span
              key={countdown}
              aria-hidden
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.3, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className={cn("text-[6rem] sm:text-[10rem] font-extralight tabular-nums select-none", STAGE_INK_SOFT)}
            >
              {countdown}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic warning */}
      <div className="shrink-0 px-4 pt-3">
        <MicAccessWarning />
      </div>

      {/* Mic-blocked recovery prompt */}
      {armed && !showFeedback && isMicBlocked && (
        <div className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-full border border-orange-500/40 bg-neutral-900/95 px-4 py-2.5 shadow-lg">
          <Mic className="h-4 w-4 shrink-0 text-orange-400" />
          <span className="text-sm text-neutral-200">
            Microphone blocked — rehearsal needs it to hear you.
          </span>
          <Button
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            style={{ backgroundColor: 'var(--primary)' }}
            onClick={requestMic}
          >
            Enable mic
          </Button>
        </div>
      )}

      {/* Mid-scene offer. Suppressed while the mic is blocked: that is a moment
          the product is failing, and it owns the bottom of the screen anyway. */}
      {midSceneOffer.visible && !isMicBlocked && (
        <TrialOfferBanner
          body="Want to run your own sides like this?"
          href={midSceneOffer.href}
          onAccept={midSceneOffer.accept}
          onDismiss={midSceneOffer.dismiss}
        />
      )}

      {/* Script parchment */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div
          className={cn("max-w-4xl mx-auto rounded-xl border border-black/5 px-4 sm:px-8 py-5 sm:py-7 shadow-[0_24px_70px_-24px_rgba(203,75,0,0.28),0_10px_34px_-14px_rgba(0,0,0,0.55)]", SCRIPT_SURFACE)}
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {sceneWithLines ? (
            <>
              {/* Script header */}
              <div className="text-center mb-6 pb-5 border-b border-neutral-200">
                <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-neutral-900">
                  {sceneWithLines.title}
                </h1>
                {sceneWithLines.description?.trim() && (
                  <p className="text-base italic text-neutral-600 mt-1.5">{sceneWithLines.description}</p>
                )}
                <p className="text-base text-neutral-700 mt-2">
                  from <span className="text-neutral-900 font-medium">{sceneWithLines.play_title}</span>
                  {sceneWithLines.play_author && (
                    <>{' '}by <span className="text-neutral-900 font-medium">{sceneWithLines.play_author}</span></>
                  )}
                </p>
              </div>

              {/* Script lines */}
              <div className="space-y-2">
                {orderedLines.map((line, lineIdx) => {
                  const isCurrent = lineIdx === activeLineIndex;
                  const isUser = isMyLine(session, line.character_name, cueNamesRef.current);
                  const isCurrentUserLine = isCurrent && isUser;
                  const isCurrentAiLine = isCurrent && !isUser;

                  return (
                    <Fragment key={line.id}>
                    {/* Action sits between speeches on the page, not under a cue.
                        Inside the character's block it read as something they say
                        out loud — Anita appeared to deliver a paragraph about a
                        crowd at a hearing. It stands on its own now. */}
                    {line.stage_direction?.trim() && (
                      <p className="px-6 py-3 text-center text-[13px] italic leading-relaxed text-neutral-500 sm:px-12">
                        {line.stage_direction.trim()}
                      </p>
                    )}
                    <motion.div
                      data-line-index={lineIdx}
                      ref={isCurrent ? currentLineRef : undefined}
                      initial={false}
                      animate={
                        isCurrentUserLine && shouldShake
                          ? { x: [-8, 8, -6, 6, -4, 4, 0], opacity: 1, scale: 1, y: 0 }
                          : isCurrent
                            ? { opacity: 1, scale: 1, y: 0 }
                            : { opacity: 0.45, scale: 0.97, y: 0 }
                      }
                      transition={
                        isCurrent && !shouldShake
                          ? { type: 'spring', stiffness: 320, damping: 28 }
                          : { duration: 0.25, ease: 'easeOut' }
                      }
                      className={cn(
                        'px-3 sm:px-4 py-2 transition-colors duration-300',
                        !isCurrent && 'cursor-pointer hover:opacity-75',
                        isCurrentUserLine && 'border-l-2 border-orange-400/70',
                        isCurrentAiLine && 'border-l-2 border-neutral-300',
                        isUser && highlightMyLines && 'bg-orange-50/50',
                      )}
                      onClick={() => {
                        if (!isCurrent) handleJumpToLine(lineIdx);
                        else if (isCurrentUserLine && isUserTurn && !isListening && !isTranscribing) {
                          setSpeechError(null);
                          if (pendingAdvanceRef.current) {
                            clearTimeout(pendingAdvanceRef.current);
                            pendingAdvanceRef.current = null;
                          }
                          if (pendingRetryRef.current) {
                            clearTimeout(pendingRetryRef.current);
                            pendingRetryRef.current = null;
                          }
                          setWordMatchResult(null);
                          setToast(null);
                          setAutoListenLineKey(null);
                          startListening();
                        }
                      }}
                    >
                      {/* Character name row */}
                      <div className="flex items-center justify-center gap-2 mb-1">
                        {isUser ? (
                          <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shrink-0 text-[9px] font-bold text-white">
                            {line.character_name.charAt(0).toUpperCase()}
                          </div>
                        ) : (() => {
                          const meta = characterVoiceMeta.get(line.character_name);
                          const bgColor = meta?.color ?? 'bg-neutral-500';
                          return (
                            <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white", bgColor)}>
                              {(meta?.label ?? line.character_name).charAt(0).toUpperCase()}
                            </div>
                          );
                        })()}
                        <span className="text-base font-extrabold uppercase tracking-widest text-black">
                          {line.character_name}
                        </span>
                        <span className={cn(
                          "text-[11px] font-bold min-w-[30px]",
                          isUser ? "text-orange-700" : "text-transparent select-none"
                        )}>
                          {isUser ? "(You)" : "\u00A0"}
                        </span>
                      </div>

                      {/* Waveform row — always reserved, prevents layout shift */}
                      <div className="flex justify-center mb-2">
                        {isCurrentAiLine ? (
                          <TTSWaveform
                            audioElement={aiAudioRef.current}
                            isLoading={isLoadingAI}
                            isSpeaking={isSpeakingAI}
                            className="w-32 h-4"
                          />
                        ) : isCurrentUserLine ? (
                          <AudioWaveform
                            analyserRef={analyserRef}
                            active={isListening}
                            className="w-32 h-4"
                          />
                        ) : (
                          <div className="w-32 h-4" />
                        )}
                      </div>

                      {/* Line text — live highlights while listening, post-result highlights after */}
                      <p className="text-[17px] font-semibold leading-relaxed text-black text-center break-words whitespace-pre-wrap">
                        {isCurrentUserLine && wordMatchResult
                          ? renderLineWithWordHighlights(line.text, wordMatchResult)
                          : isCurrentUserLine && liveWordResult
                          ? renderLineWithWordHighlights(line.text, liveWordResult)
                          : isCurrentAiLine && isSpeakingAI && aiSpokenIndex >= 0
                          ? renderLineWithSpokenSweep(line.text, aiSpokenIndex)
                          : renderTextWithStageDirections(line.text)
                        }
                      </p>

                      {/* Advance by hand. When speech is working this is a quiet
                          "skip"; when it isn't, it's the only way through the
                          scene, so it stops being an 11px grey underline and
                          becomes the obvious next action. */}
                      {isCurrentUserLine && isUserTurn && !isTranscribing && (
                        <div className="flex justify-center mt-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleManualAdvance(); }}
                            className={
                              speechIsBroken
                                ? 'rounded-full border border-amber-500 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 min-h-[44px]'
                                : 'text-[11px] text-neutral-500 hover:text-neutral-800 underline underline-offset-2 transition-colors'
                            }
                          >
                            {speechIsBroken ? 'I said my line →' : 'Skip line'}
                          </button>
                        </div>
                      )}
                      {isCurrentUserLine && speechIsBroken && (
                        <p className="text-xs text-amber-600 mt-1.5 text-center">
                          {speechError === 'mic-blocked'
                            ? 'I can’t hear you — the mic is blocked. Tap above after each line.'
                            : 'I can’t hear you in this browser. Tap above after you say each line.'}
                        </p>
                      )}
                    </motion.div>
                    </Fragment>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-neutral-400 text-sm text-center py-8">Loading script...</p>
          )}
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="shrink-0 px-4 pb-2"
          >
            <div className="max-w-md mx-auto flex items-center gap-2 rounded-lg bg-red-950/50 border border-red-900/50 px-3 py-2">
              <p className="text-xs text-red-300 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                <X className="h-3 w-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic switch toast */}
      <AnimatePresence>
        {micSwitchToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="shrink-0 flex justify-center px-4 pb-2"
          >
            <div className="flex items-center gap-3 rounded-full bg-neutral-900/90 backdrop-blur-sm border border-neutral-700 px-4 py-2 text-xs text-neutral-300">
              <span className="truncate max-w-[180px]">{micSwitchToast.label} detected</span>
              <button
                onClick={() => {
                  setSelectedMicId(micSwitchToast.deviceId);
                  setMicSwitchToast(null);
                  if (micSwitchTimerRef.current) clearTimeout(micSwitchTimerRef.current);
                }}
                className="text-white font-medium hover:text-neutral-200 shrink-0"
              >
                Switch
              </button>
              <button
                onClick={() => {
                  setMicSwitchToast(null);
                  if (micSwitchTimerRef.current) clearTimeout(micSwitchTimerRef.current);
                }}
                className="text-neutral-500 hover:text-neutral-400 shrink-0"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast notification — above control pill */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="shrink-0 flex justify-center px-4 pb-2"
          >
            <div className="rounded-full bg-neutral-900/90 backdrop-blur-sm border border-neutral-800 px-4 py-2 text-xs text-neutral-300">
              {toast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paused speech toast — slides in from left */}
      <AnimatePresence>
        {pausedSpeechToast && (
          <motion.div
            initial={{ opacity: 0, x: -200 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -200 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-24 left-4 z-[10060]"
          >
            <div className="flex items-center gap-3 rounded-lg bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 pl-3 pr-2 py-2.5 shadow-2xl">
              <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse shrink-0" />
              <span className="text-sm text-neutral-200">Rehearsal paused</span>
              <button
                onClick={() => { setPausedSpeechToast(false); handleResume(); }}
                className="ml-1 px-3 py-1 rounded-md bg-primary hover:bg-primary/80 text-xs font-medium text-white transition-colors"
              >
                Resume
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating control pill */}
      <div className="shrink-0 flex justify-center px-4 pb-4 safe-area-bottom">
        <div className={cn(CHROME_DARK, "flex items-center gap-2 sm:gap-3 bg-neutral-900/90 backdrop-blur-sm border border-neutral-800 rounded-full shadow-2xl px-3 sm:px-5 py-3 min-h-[52px] max-w-[calc(100vw-1.5rem)]")}>
          {/* Pause / Play */}
          <button
            type="button"
            onClick={() => { unlockAudio(); (paused ? handleResume : handlePause)(); }}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={paused ? 'Resume rehearsal' : 'Pause rehearsal'}
            title={paused ? 'Resume rehearsal' : 'Pause rehearsal'}
          >
            {paused
              ? <Play className="w-4.5 h-4.5 text-neutral-300 ml-0.5" aria-hidden />
              : <Pause className="w-4.5 h-4.5 text-neutral-300" aria-hidden />
            }
          </button>

          {/* Status indicator — fixed width on desktop; shrinks + truncates on mobile */}
          <div className="flex items-center gap-1.5 min-w-0 sm:w-[140px]">
            <div className={cn('w-2 h-2 rounded-full shrink-0', statusInfo.color, statusInfo.pulse && 'animate-pulse')} />
            <span className="text-[11px] text-neutral-400 whitespace-nowrap truncate">{statusInfo.text}</span>
          </div>

          {/* Progress: line counter + bar */}
          {orderedLines.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-16 sm:w-24 h-1 bg-neutral-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  animate={{ width: `${orderedLines.length > 0 ? (((activeLineIndex ?? 0) + 1) / orderedLines.length) * 100 : 0}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="hidden sm:inline text-[10px] text-neutral-500 tabular-nums whitespace-nowrap">
                {(activeLineIndex ?? 0) + 1}/{orderedLines.length}
              </span>
            </div>
          )}

          {/* Mic picker */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={async () => {
                if (showMicPicker) { setShowMicPicker(false); return; }
                try {
                  const all = await navigator.mediaDevices.enumerateDevices();
                  setMicDevices(all.filter(d => d.kind === 'audioinput'));
                } catch { setMicDevices([]); }
                setShowMicPicker(true);
              }}
              className={cn(
                'w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                showMicPicker && 'bg-neutral-700'
              )}
              aria-label="Select microphone"
              title="Select microphone"
            >
              <Mic className="w-4 h-4 text-neutral-400" aria-hidden />
            </button>
            {showMicPicker && (
              <div className="absolute bottom-full mb-2 right-0 w-60 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl py-1.5 z-50">
                <p className="text-[10px] text-neutral-500 px-3 pb-1.5 uppercase tracking-wider font-medium">Microphone</p>
                {micDevices.length === 0 ? (
                  <p className="text-xs text-neutral-400 px-3 py-2">No devices found</p>
                ) : micDevices.map((device, i) => {
                  const savedMicAvailable = micDevices.some(d => d.deviceId === selectedMicId);
                  const isSelected = (selectedMicId && savedMicAvailable) ? device.deviceId === selectedMicId : i === 0;
                  return (
                    <button
                      key={device.deviceId}
                      type="button"
                      onClick={() => { setSelectedMicId(device.deviceId); setShowMicPicker(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-neutral-800 transition-colors"
                    >
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', isSelected ? 'bg-primary' : 'bg-neutral-600')} />
                      <span className={cn('truncate', isSelected ? 'text-neutral-100' : 'text-neutral-400')}>
                        {device.label || `Microphone ${i + 1}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Theme — mid-rehearsal, because the right brightness for a room is
              not something you know before you start reading in it. Swapping the
              theme is a class change on <html>; it touches no audio state, so a
              run in progress carries straight on. */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {isDarkTheme
              ? <Sun className="w-4 h-4 text-neutral-400" aria-hidden />
              : <Moon className="w-4 h-4 text-neutral-400" aria-hidden />}
          </button>

          {/* Shortcuts */}
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="hidden sm:flex w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <span className="text-[11px] font-semibold text-neutral-400" aria-hidden>?</span>
          </button>

          {/* Exit */}
          <button
            type="button"
            onClick={() => { handlePause(); setShowPausePlayOverlay(null); setShowExitModal(true); }}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Exit rehearsal"
            title="Exit rehearsal"
          >
            <X className="w-4 h-4 text-neutral-400" aria-hidden />
          </button>
        </div>
      </div>

      {/* Exit confirmation modal */}
      <Dialog open={showExitModal} onOpenChange={(open) => {
        if (!open) { setShowExitModal(false); handleResume(); }
      }}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 max-w-xs">
          <DialogHeader>
            <DialogTitle>End Rehearsal?</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Your progress for this session will be saved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 bg-neutral-100 text-neutral-900 hover:bg-white"
              onClick={() => { setShowExitModal(false); handleResume(); }}
            >
              Keep Going
            </Button>
            <Button
              variant="outline"
              className="flex-1 bg-transparent border-neutral-600 text-neutral-200 hover:bg-neutral-800 hover:text-white"
              onClick={() => {
                setShowExitModal(false);
                handleExit();
              }}
            >
              Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Big pause/play overlay */}
      <AnimatePresence>
        {showPausePlayOverlay && (
          <motion.div
            key="pause-play-overlay"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.15, exit: { duration: 0.45 } }}
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-[10060]"
          >
            <div className="w-24 h-24 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center shadow-[0_0_60px_rgba(0,0,0,0.4)]">
              {showPausePlayOverlay === 'pause'
                ? <Pause className="w-11 h-11 text-white/90" />
                : <Play className="w-11 h-11 text-white/90 ml-1" />
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
      />

      {/* Keyboard shortcuts modal */}
      <Dialog open={showShortcutsModal} onOpenChange={setShowShortcutsModal}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-xl">Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            {[
              { keys: ['Space'], label: 'Pause / Resume' },
              { keys: ['Enter'], label: 'Skip current line' },
              { keys: ['Shift', 'Enter'], label: 'Go back one line' },
              { keys: ['?'], label: 'Show this menu' },
            ].map(({ keys, label }) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className="text-sm text-neutral-300">{label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {keys.map(k => (
                    <kbd key={k} className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-[11px] font-mono text-neutral-300">{k}</kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
