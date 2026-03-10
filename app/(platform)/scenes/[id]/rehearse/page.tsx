'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { SCRIPTS_FEATURE_ENABLED } from '@/lib/featureFlags';
import UnderConstructionScripts from '@/components/UnderConstructionScripts';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Pause,
  Play,
  Volume2,
  X,
  Mic,
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
import { TTSWaveform } from '@/components/scenepartner/TTSWaveform';
import { AudioWaveform } from '@/components/scenepartner/AudioWaveform';
import { parseUpgradeError } from '@/lib/upgradeError';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { cn } from '@/lib/utils';

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
  if (!allDirs.length) {
    return `${base} Deliver this line with emotional truth, natural pacing, and full commitment to the moment.`;
  }
  return `${base} Stage direction: ${allDirs.join('; ')}. Fully embody this — if it says "sighing", actually sigh; "whispering", drop your voice; "angrily", let real frustration through. Commit completely.`;
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

/** Decode audio blob → waveform peaks, trimming leading silence. */
function useWaveformData(blob: Blob | null) {
  const [data, setData] = useState<{ peaks: number[]; speechStartRatio: number } | null>(null);

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

        // Find speech start: first sample above noise floor
        const noiseThreshold = 0.02;
        let speechStart = 0;
        for (let i = 0; i < raw.length; i++) {
          if (Math.abs(raw[i]) > noiseThreshold) { speechStart = i; break; }
        }
        // Back up slightly so we don't clip the attack
        speechStart = Math.max(0, speechStart - Math.floor(decoded.sampleRate * 0.05));
        const speechStartRatio = speechStart / raw.length;

        // Downsample to ~60 bars from speech start onward
        const barCount = 60;
        const usableLength = raw.length - speechStart;
        const samplesPerBar = Math.floor(usableLength / barCount);
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
        // Normalize to 0–1
        const maxPeak = Math.max(...peaks, 0.01);
        const normalized = peaks.map(p => p / maxPeak);

        if (!cancelled) setData({ peaks: normalized, speechStartRatio });
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
  peaks,
  onToggle,
}: {
  blob: Blob;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  speechStartRatio: number;
  peaks: number[];
  onToggle: () => void;
}) {
  const barContainerRef = useRef<HTMLDivElement>(null);
  const mutedOverlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // RAF loop — update clipPath on the muted overlay directly (no React re-render)
  useEffect(() => {
    const overlay = mutedOverlayRef.current;
    if (!overlay) return;
    if (!isPlaying || !audioRef.current) {
      overlay.style.clipPath = 'inset(0 0 0 0%)';
      return;
    }
    const audio = audioRef.current;
    // Show start position immediately before duration is known
    overlay.style.clipPath = `inset(0 0 0 ${speechStartRatio * 100}%)`;
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        const pct = Math.min(1, audio.currentTime / dur) * 100;
        overlay.style.clipPath = `inset(0 0 0 ${pct}%)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, audioRef, speechStartRatio]);

  // Click-to-seek on waveform
  const handleBarClick = (e: React.MouseEvent) => {
    const container = barContainerRef.current;
    const audio = audioRef.current;
    if (!container || !audio || !isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = container.getBoundingClientRect();
    const clickRatio = (e.clientX - rect.left) / rect.width;
    const trimmedStart = speechStartRatio * audio.duration;
    const trimmedDuration = audio.duration - trimmedStart;
    audio.currentTime = trimmedStart + clickRatio * trimmedDuration;
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
}: {
  blob: Blob;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onToggle: (speechStartRatio: number) => void;
}) {
  const waveData = useWaveformData(blob);
  if (!waveData) return null;
  return (
    <ReviewWaveform
      blob={blob}
      isPlaying={isPlaying}
      audioRef={audioRef}
      speechStartRatio={waveData.speechStartRatio}
      peaks={waveData.peaks}
      onToggle={() => onToggle(waveData.speechStartRatio)}
    />
  );
}

/* ─── Word match scoring ─────────────────────────────────────────────── */

/** Normalize text for word matching: add space after sentence punctuation
 *  (fixes "talk.We" → "talk we") but preserve contractions ("I've" → "ive"). */
const normWords = (s: string) =>
  s.toLowerCase()
    .replace(/([.!?;:])([a-z])/gi, '$1 $2')  // space after sentence punct if missing
    .replace(/[^a-z0-9\s]/g, '')               // strip remaining non-alpha
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Soundex encoder — phonetically groups homophones (soles↔souls, their↔there, etc.) */
function soundex(s: string): string {
  const map: Record<string, string> = {
    b:'1',f:'1',p:'1',v:'1',
    c:'2',g:'2',j:'2',k:'2',q:'2',s:'2',x:'2',z:'2',
    d:'3',t:'3', l:'4', m:'5',n:'5', r:'6',
  };
  let code = s[0].toUpperCase();
  let prev = map[s[0]] ?? '0';
  for (let i = 1; i < s.length && code.length < 4; i++) {
    const c = map[s[i]] ?? '0';
    if (c !== '0' && c !== prev) code += c;
    if (c !== '0') prev = c;
  }
  return code.padEnd(4, '0');
}

/** True if two normalized words are equivalent: exact match, or phonetically identical
 *  for words of 3+ chars (guards against "be"↔"by" false positives on short words). */
function wordsMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 3 && b.length >= 3 && soundex(a) === soundex(b));
}

/** Fuzzy indexOf — finds first position in haystack where wordsMatch(needle, haystack[i]). */
function fuzzyIndexOf(haystack: string[], needle: string, from: number): number {
  for (let i = from; i < haystack.length; i++) {
    if (wordsMatch(needle, haystack[i])) return i;
  }
  return -1;
}

/** Returns fraction of expected words found in transcript (0–1). */
function wordMatchScore(expected: string, transcript: string): number {
  const expectedWords = normWords(expected).split(/\s+/).filter(Boolean);
  if (!expectedWords.length) return 1;
  const transcriptWords = normWords(transcript).split(/\s+/).filter(Boolean);
  const matched = expectedWords.filter(w => transcriptWords.some(tw => wordsMatch(w, tw))).length;
  return matched / expectedWords.length;
}

interface WordMatchResult {
  words: { word: string; matched: boolean }[];
  willAdvance: boolean;
}

/** Renders line text with per-word highlight coloring based on word match result.
 *  Uses position-based indexing (not word-text keys) so duplicate words are
 *  highlighted independently. Stage directions ([bracket]) are italic and don't
 *  consume word positions. */
function renderLineWithWordHighlights(text: string, result: WordMatchResult) {
  // wordPos tracks which result.words[i] we're consuming — positional, not text-keyed
  let wordPos = 0;

  const highlightToken = (token: string, key: string) => {
    // Count how many normalized words this display token produces (e.g. "talk.We" → 2)
    const normed = normWords(token).split(/\s+/).filter(Boolean);
    if (normed.length === 0) return <span key={key}>{token}</span>; // punctuation-only, no position consumed
    // Highlight if ANY of the sub-words are matched
    let anyMatched = false;
    for (let i = 0; i < normed.length; i++) {
      const entry = result.words[wordPos + i];
      if (entry?.matched) anyMatched = true;
    }
    wordPos += normed.length;
    if (anyMatched) return <span key={key} className="text-primary">{token}</span>;
    return <span key={key} className="opacity-40">{token}</span>;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const processSegment = (segment: string, baseKey: string) => {
    segment.split(/(\s+)/).forEach((token, i) => {
      if (/^\s*$/.test(token)) { parts.push(token); return; }
      parts.push(highlightToken(token, `${baseKey}-${i}`));
    });
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) processSegment(text.slice(lastIndex, match.index), `t${lastIndex}`);
    // Stage directions are NOT part of result.words — render italic, skip wordPos
    parts.push(
      <em key={`d${match.index}`} className="italic text-neutral-500 text-[0.85em]">
        ({match[1]})
      </em>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) processSegment(text.slice(lastIndex), `t${lastIndex}`);
  return <>{parts}</>;
}

/* ─── Types ──────────────────────────────────────────────────────────── */

interface RehearsalSession {
  id: number;
  scene_id: number;
  user_character: string;
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

  const backUrl = scriptId
    ? `/my-scripts/${scriptId}/scenes/${sceneId}/edit`
    : '/my-scripts';

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
  const sessionStartTimeRef = useRef<number>(Date.now());
  const [sessionDuration, setSessionDuration] = useState(0);
  const [playingLineIdx, setPlayingLineIdx] = useState<number | null>(null);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const reviewAudioUrlRef = useRef<string | null>(null);

  /* ── Local script-following state ───────────────────────────────── */

  // The current position in orderedLines. null = not started.
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  // Whether the AI is currently speaking (local tracking, separate from TTS hook state)
  const [lastAiLine, setLastAiLine] = useState<string | null>(null);

  const currentLineRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);
  const gotResultRef = useRef(false);
  const lastKnownVoiceIdRef = useRef(voiceParam || 'coral');
  // Maps each AI character name → assigned TTS voice ID (for multi-character scenes)
  const characterVoiceMapRef = useRef<Map<string, string>>(new Map());
  const lastAiLineForFallbackRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSilentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to break stale closures — always point to latest versions
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const advanceScriptRef = useRef<(idx: number) => void>(() => {});

  /* ── Settings ───────────────────────────────────────────────────── */

  const [highlightMyLines] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('scene_highlight_my_lines') === 'true' : false
  );
  const [rehearsalSettings] = useState<RehearsalSettings>(() =>
    typeof window !== 'undefined'
      ? getRehearsalSettings()
      : { pauseBetweenLinesSeconds: 3, skipMyLineIfSilent: false, skipAfterSeconds: 10, countdownSeconds: 3, useAIVoice: true, autoAdvanceOnFinish: true }
  );
  const [useAIVoice] = useState(() =>
    typeof window !== 'undefined' ? getRehearsalSettings().useAIVoice !== false : true
  );

  /* ── Derived: ordered lines (memoized) ─────────────────────────── */

  const orderedLines = useMemo(
    () => sceneWithLines?.lines?.slice().sort((a, b) => a.line_order - b.line_order) ?? [],
    [sceneWithLines?.lines],
  );
  const orderedLinesRef = useRef(orderedLines);

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
    if (!line || line.character_name !== session.user_character) return null;
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
    analyserRef,
    streamRef: whisperStreamRef,
    audioCtxRef: whisperAudioCtxRef,
  } = useWhisperSTT({
    silenceThreshold: 10,
    silenceTimeoutMs: 2000,
    speechGateRef: whisperGateRef,
    deviceId: selectedMicId,
    prompt: currentUserLineText ? stripStageDirections(currentUserLineText) : undefined,
    onResult: (text) => {
      if (srAdvancedRef.current) return; // SR already advanced this line — ignore late Whisper result
      gotResultRef.current = true;
      setSpeechError(null);
      const expected = currentUserLineText ? stripStageDirections(currentUserLineText) : '';
      const score = wordMatchScore(expected, text);
      const willAdvance = !expected || score >= 0.5;

      // Build per-word match result from expected line words (fuzzy so homophones highlight correctly)
      const transcriptWordArr = normWords(text).split(/\s+/).filter(Boolean);
      const words = expected
        ? normWords(expected).split(/\s+/).filter(Boolean).map(w => ({ word: w, matched: transcriptWordArr.some(tw => wordsMatch(w, tw)) }))
        : [];

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
    const nextIsAlsoAI = sess && nextIdx < lines.length && lines[nextIdx].character_name !== sess.user_character;
    const pauseMs = nextIsAlsoAI ? 300 : Math.max(600, rehearsalSettings.pauseBetweenLinesSeconds * 1000);
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
      const fallbackLine = lastAiLineForFallbackRef.current;
      if (fallbackLine && isSpeechSynthesisSupported) {
        speakBrowser(fallbackLine);
      }
    },
  });

  const anySpeaking = isSpeakingBrowser || isSpeakingAI || isLoadingAI;

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

  /* ── Core: advance to a specific line index ────────────────────── */

  const advanceScript = (idx: number) => {
    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    if (!sess || !lines.length) return;

    if (idx >= lines.length) {
      // Scene complete — fade out rehearsal, then show review
      setActiveLineIndex(lines.length - 1);
      setLastAiLine(null);
      loadFeedback();
      setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
      // Brief pause so last line highlights are visible, then fade to black
      setTimeout(() => setFadeToReview(true), 400);
      // After fade completes, switch to review
      setTimeout(() => setShowFeedback(true), 900);
      return;
    }

    setActiveLineIndex(idx);
    const line = lines[idx];

    if (line.character_name !== sess.user_character) {
      // AI's turn — delay speech slightly so scroll + animation complete before voice starts
      setLastAiLine(line.text);
      setAutoListenLineKey(null);
      if (speakDelayRef.current) clearTimeout(speakDelayRef.current);
      speakDelayRef.current = setTimeout(() => {
        speakDelayRef.current = null;
        speakLineRef.current(ttsText(line), ttsInstructions(line, sceneVoiceContextRef.current), line.character_name);
      }, 220);
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
    autoStartedRef.current = false;
    lineAudioBlobsRef.current.clear();
    lineTranscriptsRef.current.clear();
    setSessionDuration(0);
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
        const voicePool = ['coral', 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'sage'];
        const aiChars = [...new Set(sceneData.lines.map(l => l.character_name))]
          .filter(c => c !== data.user_character);
        const newVoiceMap = new Map<string, string>();
        newVoiceMap.set(data.ai_character, voiceId);
        const remainingVoices = voicePool.filter(v => v !== voiceId);
        let vIdx = 0;
        for (const char of aiChars) {
          if (!newVoiceMap.has(char)) {
            newVoiceMap.set(char, remainingVoices[vIdx % remainingVoices.length]);
            vIdx++;
          }
        }
        characterVoiceMapRef.current = newVoiceMap;

        sceneData.lines
          .filter(l => l.character_name !== data.user_character)
          .slice(0, 5)
          .forEach(l => preloadTTSRef.current(ttsText(l), newVoiceMap.get(l.character_name) ?? voiceId, ttsInstructions(l, sceneVoiceContextRef.current)));
      } catch {
        // Non-fatal
      }
      // Respect countdown setting
      const countdownSec = rehearsalSettings.countdownSeconds;
      if (countdownSec && countdownSec > 0) {
        setCountdown(countdownSec);
      } else {
        setCountdown(null);
      }
      setFocusInitialized(true);
    } catch {
      setError('Session not found. Start rehearsal from your script.');
    }
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

  // Kill audio when user navigates away (back button, bfcache, client-side route)
  useEffect(() => {
    const stop = () => { cancelAI(); window.speechSynthesis?.cancel(); };
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      // Component unmount — kill all pending timers and audio
      stop();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (srAdvanceTimerRef.current) clearTimeout(srAdvanceTimerRef.current);
      if (pendingAdvanceRef.current) clearTimeout(pendingAdvanceRef.current);
    };
  }, [cancelAI]);

  // Initial load
  useEffect(() => {
    if (sessionId) loadSession();
    else setError('No session. Start rehearsal from your script.');
  }, [sessionId]);

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

  // Auto-start: begin from session.current_line_index (respects "Start from here")
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (countdown !== null) return;
    if (paused) return;
    if (!focusInitialized || !session || !orderedLines.length) return;

    autoStartedRef.current = true;
    sessionStartTimeRef.current = Date.now();
    const startIdx = Math.min(session.current_line_index ?? 0, orderedLines.length - 1);
    setActiveLineIndex(startIdx);
    const firstLine = orderedLines[startIdx];

    if (firstLine.character_name !== session.user_character) {
      setLastAiLine(firstLine.text);
      speakLineRef.current(ttsText(firstLine), ttsInstructions(firstLine, sceneVoiceContextRef.current), firstLine.character_name);
    } else {
      // User's line — auto-listen will handle
      setLastAiLine(null);
    }
  }, [countdown, paused, focusInitialized, session?.id, orderedLines.length]);

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
    const norm = normWords;
    const expectedWords = norm(expected).split(/\s+/).filter(Boolean);

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
        // Separate confirmed-final words from current interim prediction
        let finalTranscript = '';
        let fullTranscript = '';
        let hasFinal = false;
        for (let i = 0; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          fullTranscript += t + ' ';
          if (event.results[i].isFinal) { finalTranscript += t + ' '; hasFinal = true; }
        }

        // DISPLAY: match against full transcript (includes interim) for real-time word-by-word highlighting
        const displayWords = norm(fullTranscript).split(/\s+/).filter(Boolean);
        const displayMatched = new Set<number>();
        let dc = 0;
        for (let ei = 0; ei < expectedWords.length; ei++) {
          const f = fuzzyIndexOf(displayWords, expectedWords[ei], dc);
          if (f !== -1) { displayMatched.add(ei); dc = f + 1; }
          // no break — skip misheard words so later words can still match
        }
        // Merge into best-seen set — prevents SR regressions from un-highlighting words
        displayMatched.forEach(i => bestMatchedRef.current.add(i));
        setLiveMatchedIndices(new Set(bestMatchedRef.current));

        // ADVANCE: match against full transcript (including current interim)
        const spokenWords = norm(fullTranscript).split(/\s+/).filter(Boolean);
        const matched = new Set<number>();
        let spokenCursor = 0;
        for (let ei = 0; ei < expectedWords.length; ei++) {
          const found = fuzzyIndexOf(spokenWords, expectedWords[ei], spokenCursor);
          if (found !== -1) { matched.add(ei); spokenCursor = found + 1; }
          // no break — allow matching past misheard words
        }

        // Open Whisper gate once SR has matched enough sequential words
        const gateThreshold = Math.min(3, expectedWords.length);
        if (matched.size >= gateThreshold) whisperGateRef.current = true;

        // Instant advance: SR final result — advance if score ≥70% OR last word of line matched
        if (hasFinal && !srAdvancedRef.current) {
          const score = expectedWords.length > 0 ? matched.size / expectedWords.length : 1;
          const lastWordMatched = expectedWords.length > 0 && matched.has(expectedWords.length - 1);
          if (score >= 0.70 || lastWordMatched) {
            srAdvancedRef.current = true;
            try { recognition.stop(); liveRecognitionRef.current = null; } catch {}
            cancelTranscriptionRef.current();
            const wordResult = expectedWords.map((w, i) => ({ word: w, matched: matched.has(i) }));
            setLiveMatchedIndices(new Set()); // wordMatchResult takes over
            setWordMatchResult({ words: wordResult, willAdvance: true });
            srAdvanceTimerRef.current = setTimeout(() => {
              srAdvanceTimerRef.current = null;
              handleDeliverLineRef.current(fullTranscript.trim());
            }, 400);
          }
        }
      };
      let alive = true; // flipped in cleanup to prevent restarts after unmount
      recognition.onerror = (ev: any) => {
        // Fatal errors — don't attempt restart
        if (ev.error === 'not-allowed' || ev.error === 'service-not-available') {
          alive = false;
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
    return () => {
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
      .filter(l => l.character_name !== session.user_character)
      .slice(0, 8); // preload first 8 AI lines
    aiLines.forEach(l => preloadTTS(ttsText(l), characterVoiceMapRef.current.get(l.character_name) ?? lastKnownVoiceIdRef.current, ttsInstructions(l, sceneVoiceContextRef.current)));
  }, [session?.ai_character, orderedLines, preloadTTS]);

  // Preload next AI line while user speaks
  useEffect(() => {
    if (!session || activeLineIndex == null || !orderedLines.length) return;
    const currentLine = orderedLines[activeLineIndex];
    if (!currentLine || currentLine.character_name !== session.user_character) return;

    // Preload next 2 AI lines ahead
    let found = 0;
    for (let i = activeLineIndex + 1; i < orderedLines.length && found < 3; i++) {
      const l = orderedLines[i];
      if (l.character_name !== session.user_character) {
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
      if (line && line.character_name !== sess.user_character) {
        setLastAiLine(line.text);
        speakLineRef.current(ttsText(line), ttsInstructions(line, sceneVoiceContextRef.current), line.character_name);
      }
    }
  }, []);

  const handleRestart = useCallback(async () => {
    if (!session || isRestarting) return;
    setIsRestarting(true);
    stopAllAudio();
    // Immediately show the loading spinner (whimsical texts) before navigation
    setSessionFeedback(null);
    // Clear session review data
    setFadeToReview(false);
    lineAudioBlobsRef.current.clear();
    lineTranscriptsRef.current.clear();
    setPlayingLineIdx(null);
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause();
      if (reviewAudioUrlRef.current) URL.revokeObjectURL(reviewAudioUrlRef.current);
      reviewAudioRef.current = null;
      reviewAudioUrlRef.current = null;
    }
    try {
      const { data } = await api.post<{ id: number }>('/api/scenes/rehearse/start', {
        scene_id: session.scene_id,
        user_character: session.user_character,
      });
      const vp = lastKnownVoiceIdRef.current !== 'coral' ? `&voice=${lastKnownVoiceIdRef.current}` : '';
      router.replace(`/scenes/${session.scene_id}/rehearse?session=${data.id}&script=${scriptId}${vp}`);
    } catch {
      setError('Failed to restart. Please try again.');
    } finally {
      setIsRestarting(false);
    }
  }, [session, isRestarting, stopAllAudio, router, scriptId]);

  const handleJumpToLine = useCallback((lineIndex: number) => {
    if (!sessionRef.current) return;
    stopAllAudio();
    setAutoListenLineKey(null);
    setPaused(false);
    advanceScriptRef.current(lineIndex);
  }, [stopAllAudio]);

  // Manual tap-to-advance: if speech recognition fails, user can tap their line
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
    const words = normWords(expected).split(/\s+/).filter(Boolean)
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

  const overallAccuracy = useMemo(() => {
    if (!showFeedback || !orderedLines.length || !session) return null;
    const userLines = orderedLines.filter(l => l.character_name === session.user_character);
    let totalScore = 0;
    let delivered = 0;
    userLines.forEach(line => {
      const idx = orderedLines.indexOf(line);
      const transcript = lineTranscriptsRef.current.get(idx);
      if (transcript) {
        totalScore += wordMatchScore(stripStageDirections(line.text), transcript);
        delivered++;
      }
    });
    return delivered > 0 ? Math.round((totalScore / delivered) * 100) : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFeedback]);

  const playLineAudio = useCallback((lineIdx: number, speechStartRatio = 0) => {
    const blob = lineAudioBlobsRef.current.get(lineIdx);
    if (!blob) return;

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

  /* ── Render: loading ───────────────────────────────────────────── */

  if (!session) {
    return (
      <div className="fixed inset-0 bg-neutral-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          {error ? (
            <>
              <p className="text-neutral-400 text-sm max-w-xs">{error}</p>
              <Button variant="outline" size="sm" className="border-neutral-700 text-neutral-200" onClick={() => router.push(backUrl)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Script
              </Button>
            </>
          ) : (
            <>
              <div className="h-8 w-8 rounded-full border-2 border-neutral-700 border-t-primary animate-spin mx-auto" />
              <motion.p
                key={loadingTextIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="text-neutral-400 text-sm"
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

    // Loading state: centered spinner
    if (!sessionFeedback) {
      return (
        <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex items-center justify-center z-[10050]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-6 h-6 border-2 border-neutral-700 border-t-neutral-400 rounded-full animate-spin" />
            <FeedbackLoadingText />
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-[10050]">
        <div className="flex-1 overflow-auto flex justify-center px-4 pt-10 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-3xl space-y-6"
          >
            {/* Header */}
            <div className="text-center space-y-2">
              <p className="text-sm uppercase tracking-widest text-neutral-500 font-medium">Scene Complete</p>
              <h1 className="text-2xl font-bold text-neutral-100">{sceneTitle}</h1>
              {showPlayTitle && (
                <p className="text-sm text-neutral-500">from {playTitle}</p>
              )}
            </div>

            {/* Stats bar */}
            <div className="flex items-center justify-center gap-2 text-sm text-neutral-400 flex-wrap">
              <span>{session.total_lines_delivered} lines delivered</span>
              <span className="text-neutral-700">&middot;</span>
              <span>{Math.round(session.completion_percentage)}% complete</span>
              <span className="text-neutral-700">&middot;</span>
              <span>{formatDuration(sessionDuration)}</span>
              {overallAccuracy !== null && (
                <>
                  <span className="text-neutral-700">&middot;</span>
                  <span>{overallAccuracy}% accuracy</span>
                </>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-800/60" />

            {/* AI Feedback */}
            <div className="space-y-5">
              <p className="text-base text-neutral-300 leading-relaxed">
                {sessionFeedback.overall_feedback}
              </p>

              {(sessionFeedback.strengths?.length > 0 || sessionFeedback.areas_to_improve?.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {sessionFeedback.strengths?.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-widest text-emerald-600 font-semibold">What landed</p>
                      <ul className="space-y-2">
                        {sessionFeedback.strengths.map((s: string, i: number) => (
                          <li key={i} className="text-[15px] text-neutral-300 leading-relaxed pl-4 border-l-2 border-emerald-700/60">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sessionFeedback.areas_to_improve?.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs uppercase tracking-widest text-orange-600 font-semibold">To explore</p>
                      <ul className="space-y-2">
                        {sessionFeedback.areas_to_improve.map((a: string, i: number) => (
                          <li key={i} className="text-[15px] text-neutral-300 leading-relaxed pl-4 border-l-2 border-orange-700/60">
                            {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-neutral-600 leading-relaxed">
                AI-generated analysis based on your voice input. Trust your instincts.
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-800/60" />

            {/* Transcript: line-by-line breakdown */}
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-widest text-neutral-500 font-semibold">Your Performance</p>

              <div className="space-y-3">
                {orderedLines.map((line, idx) => {
                  const isUserLine = line.character_name === session.user_character;
                  const userTranscript = lineTranscriptsRef.current.get(idx);
                  const audioBlob = lineAudioBlobsRef.current.get(idx);
                  const wasDelivered = isUserLine && userTranscript;
                  const wasSkipped = isUserLine && !userTranscript && idx <= (activeLineIndex ?? 0);

                  if (!isUserLine) {
                    // AI lines: compact, muted
                    return (
                      <div key={line.id} className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-700">
                          {line.character_name}
                        </span>
                        <p className="text-sm text-neutral-600 leading-snug">
                          {renderTextWithStageDirections(line.text)}
                        </p>
                      </div>
                    );
                  }

                  const score = wasDelivered ? wordMatchScore(stripStageDirections(line.text), userTranscript!) : null;
                  const pct = score !== null ? Math.round(score * 100) : null;

                  return (
                    <div key={line.id} className="pl-3 border-l border-neutral-800 space-y-1">
                      {/* Character name + accuracy inline */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                          {line.character_name}
                        </span>
                        {pct !== null && (
                          <span className={cn(
                            "text-[10px] tabular-nums font-medium",
                            pct >= 85 ? "text-emerald-500" : pct >= 60 ? "text-amber-500" : "text-red-500"
                          )}>{pct}%</span>
                        )}
                        {wasSkipped && <span className="text-[10px] text-neutral-700 italic">skipped</span>}
                      </div>

                      {/* Expected text */}
                      <p className={cn(
                        "text-[15px] leading-snug",
                        wasDelivered ? "text-neutral-300" : "text-neutral-500"
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
                              onToggle={(speechStartRatio) => playLineAudio(idx, speechStartRatio)}
                            />
                          )}
                          <p className="text-xs text-neutral-600 italic leading-snug">{userTranscript}</p>
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
        <div className="shrink-0 px-4 pb-5 pt-3 bg-gradient-to-t from-neutral-950 via-neutral-950 to-neutral-950/0">
          <div className="max-w-3xl mx-auto flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={handleExit}
              className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Script
            </button>
            <span className="text-neutral-800">·</span>
            <button
              type="button"
              onClick={handleRestart}
              disabled={isRestarting}
              className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors disabled:opacity-50"
            >
              {isRestarting ? 'Starting...' : 'Run It Again'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Render: main rehearsal view ───────────────────────────────── */

  return (
    <div className={cn('fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-[10050] transition-opacity duration-150', exiting && 'opacity-0')}>
      {/* Fade-to-review overlay */}
      {fadeToReview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="absolute inset-0 z-40 bg-neutral-950"
        />
      )}
      {/* Loading cover */}
      {(!focusInitialized || (countdown !== null && countdown > 0)) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-neutral-950">
          {!focusInitialized && (
            <div className="h-8 w-8 rounded-full border-2 border-neutral-700 border-t-primary animate-spin" />
          )}
        </div>
      )}

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            className="fixed inset-0 flex items-center justify-center bg-neutral-950 z-30"
          >
            <motion.span
              key={countdown}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.3, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              className="text-[10rem] font-extralight text-neutral-400 tabular-nums select-none"
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

      {/* Script parchment */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div
          className="max-w-4xl mx-auto bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-200 px-4 sm:px-6 py-5 sm:py-7"
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
                  const isUser = line.character_name === session.user_character;
                  const isCurrentUserLine = isCurrent && isUser;
                  const isCurrentAiLine = isCurrent && !isUser;

                  return (
                    <motion.div
                      key={line.id}
                      data-line-index={lineIdx}
                      ref={isCurrent ? currentLineRef : undefined}
                      initial={false}
                      animate={
                        isCurrentUserLine && shouldShake
                          ? { x: [-8, 8, -6, 6, -4, 4, 0], opacity: 1, scale: 1, y: 0 }
                          : isCurrent
                            ? { opacity: 1, scale: 1, y: 0 }
                            : { opacity: 0.28, scale: 0.96, y: 0 }
                      }
                      transition={
                        isCurrent && !shouldShake
                          ? { type: 'spring', stiffness: 320, damping: 28 }
                          : { duration: 0.25, ease: 'easeOut' }
                      }
                      className={cn(
                        'rounded-lg px-3 sm:px-4 py-3 transition-colors duration-300',
                        !isCurrent && 'cursor-pointer hover:opacity-75',
                        isCurrentUserLine && 'bg-orange-50/80 ring-1 ring-orange-200/60',
                        isCurrentAiLine && 'bg-neutral-100/60 ring-1 ring-neutral-200/60',
                        isUser && !isCurrent && highlightMyLines && 'bg-yellow-50/60',
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
                        {!isUser && isCurrent && (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center shrink-0 text-[9px] font-bold text-white">
                            {line.character_name.charAt(0).toUpperCase()}
                          </div>
                        )}
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

                      {/* Stage direction */}
                      {line.stage_direction?.trim() && (
                        <p className="text-xs italic text-neutral-800 mb-1 text-center">
                          ({line.stage_direction.trim()})
                        </p>
                      )}

                      {/* Line text — live highlights while listening, post-result highlights after */}
                      <p className="text-[17px] font-semibold leading-relaxed text-black text-center break-words whitespace-pre-wrap">
                        {isCurrentUserLine && wordMatchResult
                          ? renderLineWithWordHighlights(line.text, wordMatchResult)
                          : isCurrentUserLine && liveWordResult
                          ? renderLineWithWordHighlights(line.text, liveWordResult)
                          : renderTextWithStageDirections(line.text)
                        }
                      </p>

                      {/* Skip */}
                      {isCurrentUserLine && isUserTurn && !isTranscribing && (
                        <div className="flex justify-center mt-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleManualAdvance(); }}
                            className="text-[11px] text-neutral-500 hover:text-neutral-800 underline underline-offset-2 transition-colors"
                          >
                            Skip line
                          </button>
                        </div>
                      )}
                      {isCurrentUserLine && !isSpeechRecognitionSupported && (
                        <p className="text-xs text-amber-600 mt-1.5 text-center">Mic not available in this browser.</p>
                      )}
                    </motion.div>
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
        <div className="flex items-center gap-3 bg-neutral-900/90 backdrop-blur-sm border border-neutral-800 rounded-full shadow-2xl px-5 py-3 min-h-[52px]">
          {/* Pause / Play */}
          <button
            type="button"
            onClick={paused ? handleResume : handlePause}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            title={paused ? 'Resume rehearsal' : 'Pause rehearsal'}
          >
            {paused
              ? <Play className="w-4.5 h-4.5 text-neutral-300 ml-0.5" />
              : <Pause className="w-4.5 h-4.5 text-neutral-300" />
            }
          </button>

          {/* Status indicator — wider to fit long character names */}
          <div className="flex items-center gap-1.5 w-[140px] shrink-0">
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
              <span className="text-[10px] text-neutral-500 tabular-nums whitespace-nowrap">
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
                'w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors',
                showMicPicker && 'bg-neutral-700'
              )}
              title="Select microphone"
            >
              <Mic className="w-4 h-4 text-neutral-400" />
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

          {/* Shortcuts */}
          <button
            type="button"
            onClick={() => setShowShortcutsModal(true)}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            title="Keyboard shortcuts"
          >
            <span className="text-[11px] font-semibold text-neutral-400">?</span>
          </button>

          {/* Exit */}
          <button
            type="button"
            onClick={() => { handlePause(); setShowPausePlayOverlay(null); setShowExitModal(true); }}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            title="Exit rehearsal"
          >
            <X className="w-4 h-4 text-neutral-400" />
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
              variant="outline"
              className="flex-1 border-neutral-700 text-neutral-200 hover:bg-neutral-800"
              onClick={() => { setShowExitModal(false); handleResume(); }}
            >
              Keep Going
            </Button>
            <Button
              className="flex-1"
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
