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
  Sparkles,
  Check,
  Trophy,
  Star,
  Pause,
  Play,
  X,
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
  type RehearsalSettings,
} from '@/lib/scenepartnerStorage';
import { MicAccessWarning } from '@/components/scenepartner/MicAccessWarning';
import { TTSWaveform } from '@/components/scenepartner/TTSWaveform';
import { AudioWaveform } from '@/components/scenepartner/AudioWaveform';
import { parseUpgradeError } from '@/lib/upgradeError';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { cn } from '@/lib/utils';

/** Build TTS input text: prepend stage_direction as a parenthetical so the
 *  voice model can act on it (e.g. "laughingly" → speaks with a laugh). */
function ttsText(line: { text: string; stage_direction?: string | null }): string {
  const dialogue = stripStageDirections(line.text);
  const dir = line.stage_direction?.trim();
  return dir ? `(${dir}) ${dialogue}` : dialogue;
}

const LOADING_TEXTS = [
  "Warming up the stage lights...",
  "Getting into character...",
  "Brushing up on the lines...",
  "Setting the scene...",
  "Cueing the spotlight...",
];

/* ─── Word match scoring ─────────────────────────────────────────────── */

/** Returns fraction of expected words found in transcript (0–1). */
function wordMatchScore(expected: string, transcript: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const expectedWords = norm(expected).split(/\s+/).filter(Boolean);
  if (!expectedWords.length) return 1;
  const transcriptWords = new Set(norm(transcript).split(/\s+/).filter(Boolean));
  const matched = expectedWords.filter(w => transcriptWords.has(w)).length;
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
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  // wordPos tracks which result.words[i] we're consuming — positional, not text-keyed
  let wordPos = 0;

  const highlightToken = (token: string, key: string) => {
    const normalized = norm(token);
    if (!normalized) return <span key={key}>{token}</span>; // punctuation-only, no position consumed
    const entry = result.words[wordPos++];
    if (!entry) return <span key={key}>{token}</span>;
    if (entry.matched) return <span key={key} className="text-primary">{token}</span>;
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
  const [showPausePlayOverlay, setShowPausePlayOverlay] = useState<'pause' | 'play' | null>(null);
  const [loadingTextIdx, setLoadingTextIdx] = useState(0);

  /* ── Local script-following state ───────────────────────────────── */

  // The current position in orderedLines. null = not started.
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  // Whether the AI is currently speaking (local tracking, separate from TTS hook state)
  const [lastAiLine, setLastAiLine] = useState<string | null>(null);

  const currentLineRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);
  const gotResultRef = useRef(false);
  const lastKnownVoiceIdRef = useRef(voiceParam || 'coral');
  const lastAiLineForFallbackRef = useRef<string | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipSilentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to break stale closures — always point to latest versions
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const advanceScriptRef = useRef<(idx: number) => void>(() => {});

  /* ── Settings ───────────────────────────────────────────────────── */

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
  // Per-line delivery guard — prevents the same line from being delivered twice,
  // without blocking delivery of subsequent lines (unlike isProcessing flag)
  const lastDeliveredIndexRef = useRef<number | null>(null);;
  const pendingRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live word matching via SpeechRecognition (for real-time highlighting while Whisper records)
  const [liveMatchedIndices, setLiveMatchedIndices] = useState<Set<number>>(new Set());
  const liveRecognitionRef = useRef<any>(null);
  // Prevents double-advance when SR final result fires before Whisper returns
  const srAdvancedRef = useRef(false);

  const {
    startListening,
    stopListening,
    cancelTranscription,
    isListening,
    isTranscribing,
    isSupported: isSpeechRecognitionSupported,
    liveTranscript,
    resetTranscript,
    analyserRef,
  } = useWhisperSTT({
    silenceThreshold: 25,
    silenceTimeoutMs: 1000,
    prompt: currentUserLineText ? stripStageDirections(currentUserLineText) : undefined,
    onResult: (text) => {
      if (srAdvancedRef.current) return; // SR already advanced this line — ignore late Whisper result
      gotResultRef.current = true;
      setSpeechError(null);
      const expected = currentUserLineText ? stripStageDirections(currentUserLineText) : '';
      const score = wordMatchScore(expected, text);
      const willAdvance = !expected || score >= 0.4;

      // Build per-word match result from expected line words
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const transcriptWords = new Set(norm(text).split(/\s+/).filter(Boolean));
      const words = expected
        ? norm(expected).split(/\s+/).filter(Boolean).map(w => ({ word: w, matched: transcriptWords.has(w) }))
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
        // Toast notification
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast('Try that again');
        toastTimerRef.current = setTimeout(() => setToast(null), 2500);
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
    const doAdvance = () => {
      setLastAiLine(null);
      const nextIdx = (activeLineIndexRef.current ?? 0) + 1;
      advanceScriptRef.current(nextIdx);
    };
    // Check if next line is also AI — skip pause for consecutive AI lines
    const nextIdx = (activeLineIndexRef.current ?? 0) + 1;
    const lines = orderedLinesRef.current;
    const sess = sessionRef.current;
    const nextIsAlsoAI = sess && nextIdx < lines.length && lines[nextIdx].character_name === sess.ai_character;
    // Short pause between consecutive AI lines, instant transition to user's turn
    const pauseMs = nextIsAlsoAI ? 200 : 0;
    if (pauseMs > 0) {
      pauseTimerRef.current = setTimeout(() => {
        pauseTimerRef.current = null;
        doAdvance();
      }, pauseMs);
    } else {
      doAdvance();
    }
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

  const speakLine = useCallback((text: string, instructions: string = '') => {
    if (isListening) stopListening();
    lastAiLineForFallbackRef.current = text;
    if (useAIVoice) {
      speakAI(text, lastKnownVoiceIdRef.current, instructions);
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
      // Scene complete
      setActiveLineIndex(lines.length - 1);
      setLastAiLine(null);
      loadFeedback().then(() => setShowFeedback(true));
      return;
    }

    setActiveLineIndex(idx);
    const line = lines[idx];

    if (line.character_name === sess.ai_character) {
      // AI's turn — speak it from script (strip any inline [stage directions])
      setLastAiLine(line.text);
      setAutoListenLineKey(null);
      speakLineRef.current(ttsText(line), line.stage_direction?.trim() ? `Speak ${line.stage_direction.trim()}` : '');
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
        await loadFeedback();
        setShowFeedback(true);
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
    try {
      const { data } = await api.get<RehearsalSession>(
        `/api/scenes/rehearse/sessions/${sessionId}`
      );
      setSession(data);
      if (data.max_lines != null) {
        setLinesRemaining(Math.max(0, data.max_lines - (data.total_lines_delivered ?? 0)));
      }
      // sceneWithLines is static — cache in sessionStorage so re-entry is instant
      const cacheKey = `actorrise_scene_${data.scene_id}`;
      try {
        const cached = typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(cacheKey)
          : null;
        let sceneData: SceneWithLines;
        if (cached) {
          sceneData = JSON.parse(cached);
        } else {
          const sceneRes = await api.get<SceneWithLines>(`/api/scenes/${data.scene_id}`);
          sceneData = sceneRes.data;
          try { sessionStorage.setItem(cacheKey, JSON.stringify(sceneData)); } catch { /* quota */ }
        }
        setSceneWithLines(sceneData);
        // Eagerly preload first AI lines during loading screen so they're cached before countdown ends
        const voiceId = voiceParam || data.ai_voice_id || 'coral';
        sceneData.lines
          .filter(l => l.character_name === data.ai_character)
          .slice(0, 5)
          .forEach(l => preloadTTSRef.current(ttsText(l), voiceId, ''));
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

  // Kill audio when user navigates away (back button, bfcache, etc.)
  useEffect(() => {
    const stop = () => { cancelAI(); if (isListening) stopListening(); };
    window.addEventListener('pagehide', stop);
    return () => window.removeEventListener('pagehide', stop);
  }, [cancelAI, isListening, stopListening]);

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

  // Auto-start: begin from session.current_line_index (respects "Start from here")
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (countdown !== null) return;
    if (paused) return;
    if (!focusInitialized || !session || !orderedLines.length) return;

    autoStartedRef.current = true;
    const startIdx = Math.min(session.current_line_index ?? 0, orderedLines.length - 1);
    setActiveLineIndex(startIdx);
    const firstLine = orderedLines[startIdx];

    if (firstLine.character_name === session.ai_character) {
      setLastAiLine(firstLine.text);
      speakLineRef.current(ttsText(firstLine), firstLine.stage_direction?.trim() ? `Speak ${firstLine.stage_direction.trim()}` : '');
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

  // Safety net: stop recording after 8s max so mic never gets stuck
  useEffect(() => {
    if (!isListening) return;
    const t = setTimeout(() => stopListening(), 8000);
    return () => clearTimeout(t);
  }, [isListening, stopListening]);

  // Live word highlighting: run SpeechRecognition in parallel while Whisper records
  useEffect(() => {
    if (!isListening || !currentUserLineText) {
      setLiveMatchedIndices(new Set());
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const expected = stripStageDirections(currentUserLineText);
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const expectedWords = norm(expected).split(/\s+/).filter(Boolean);

    let recognition: any;
    try {
      recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event: any) => {
        let transcript = '';
        let hasFinal = false;
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + ' ';
          if (event.results[i].isFinal) hasFinal = true;
        }
        // Sequential/greedy match — walk expected words left-to-right through spoken words
        // so duplicate words only highlight the correct positional occurrence
        const spokenWords = norm(transcript).split(/\s+/).filter(Boolean);
        const matched = new Set<number>();
        let spokenCursor = 0;
        for (let ei = 0; ei < expectedWords.length; ei++) {
          const found = spokenWords.indexOf(expectedWords[ei], spokenCursor);
          if (found !== -1) {
            matched.add(ei);
            spokenCursor = found + 1;
          }
        }
        setLiveMatchedIndices(matched);

        // Instant advance: SR final result with ≥55% word match → skip Whisper round-trip entirely
        // Use wordMatchScore (counts duplicate expected words) so lines like "about us. About where"
        // don't get deflated by the positional matcher used for highlighting
        if (hasFinal && !srAdvancedRef.current) {
          const score = wordMatchScore(expected, transcript);
          if (score >= 0.55) {
            srAdvancedRef.current = true;
            try { recognition.stop(); liveRecognitionRef.current = null; } catch {}
            cancelTranscriptionRef.current();
            // Build final word-match result and show it briefly before advancing
            // so the user sees which words were highlighted before the line changes
            const transcriptWordSet = new Set(norm(transcript).split(/\s+/).filter(Boolean));
            const finalWords = expectedWords.map(w => ({ word: w, matched: transcriptWordSet.has(w) }));
            setLiveMatchedIndices(new Set()); // clear live highlights; wordMatchResult takes over
            setWordMatchResult({ words: finalWords, willAdvance: true });
            setTimeout(() => {
              handleDeliverLineRef.current(transcript.trim());
            }, 400);
          }
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {};
      recognition.start();
      liveRecognitionRef.current = recognition;
    } catch {
      // SpeechRecognition unavailable or conflicted — graceful degradation
    }
    return () => {
      try { liveRecognitionRef.current?.stop(); } catch {}
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
      .filter(l => l.character_name === session.ai_character)
      .slice(0, 5); // preload first 5 AI lines
    aiLines.forEach(l => preloadTTS(ttsText(l), lastKnownVoiceIdRef.current, ''));
  }, [session?.ai_character, orderedLines, preloadTTS]);

  // Preload next AI line while user speaks
  useEffect(() => {
    if (!session || activeLineIndex == null || !orderedLines.length) return;
    const currentLine = orderedLines[activeLineIndex];
    if (!currentLine || currentLine.character_name !== session.user_character) return;

    // Preload next 2 AI lines ahead
    let found = 0;
    for (let i = activeLineIndex + 1; i < orderedLines.length && found < 2; i++) {
      if (orderedLines[i].character_name === session.ai_character) {
        preloadTTS(ttsText(orderedLines[i]), lastKnownVoiceIdRef.current, '');
        found++;
      }
    }
  }, [activeLineIndex, orderedLines, session?.user_character, session?.ai_character, preloadTTS]);

  // Scroll to current line
  useEffect(() => {
    if (activeLineIndex != null) {
      const t = setTimeout(() => {
        currentLineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [activeLineIndex]);

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
    if (isListening) stopListening();
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, [cancelAI, isListening, stopListening]);

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
      if (line && line.character_name === sess.ai_character) {
        setLastAiLine(line.text);
        speakLineRef.current(ttsText(line), line.stage_direction?.trim() ? `Speak ${line.stage_direction.trim()}` : '');
      }
    }
  }, []);

  const handleRestart = useCallback(async () => {
    if (!session || isRestarting) return;
    setIsRestarting(true);
    stopAllAudio();
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

  /* ── Keyboard shortcuts ─────────────────────────────────────────── */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Don't capture space if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (paused) handleResume();
      else handlePause();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paused, handlePause, handleResume]);

  /* ── Derived state ─────────────────────────────────────────────── */

  const isUserTurn = currentUserLineText != null && lastAiLine == null;

  // Build a live WordMatchResult from SpeechRecognition interim results
  const liveWordResult: WordMatchResult | null = (() => {
    if (!isListening || liveMatchedIndices.size === 0 || !currentUserLineText) return null;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const expected = stripStageDirections(currentUserLineText);
    const words = norm(expected).split(/\s+/).filter(Boolean)
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

  if (showFeedback && sessionFeedback) {
    return (
      <div className="fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-[10050]">
        <div className="flex-1 overflow-auto flex justify-center px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md space-y-5"
          >
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto">
                <Trophy className="h-7 w-7 text-yellow-500" />
              </div>
              <h1 className="text-xl font-semibold">Scene Complete</h1>
              <p className="text-sm text-neutral-500">
                {sceneWithLines?.title}{sceneWithLines?.play_title ? ` from ${sceneWithLines.play_title}` : ''}
              </p>
            </div>

            {/* Rating */}
            {sessionFeedback.overall_rating != null && (
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={cn(
                      'h-5 w-5',
                      s <= Math.round(sessionFeedback.overall_rating)
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-neutral-700'
                    )}
                  />
                ))}
              </div>
            )}

            {/* Overall feedback */}
            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
              <p className="text-sm font-medium text-neutral-200">Coach&apos;s Notes</p>
              <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-line">
                {sessionFeedback.overall_feedback}
              </p>
            </div>

            {/* Strengths */}
            {sessionFeedback.strengths?.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                  <Check className="h-4 w-4" />
                  What worked
                </div>
                <ul className="space-y-2">
                  {sessionFeedback.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-sm text-neutral-300 flex gap-2.5 leading-relaxed">
                      <span className="text-emerald-600 mt-0.5 shrink-0">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Areas to improve */}
            {sessionFeedback.areas_to_improve?.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-400">
                  <Sparkles className="h-4 w-4" />
                  To work on
                </div>
                <ul className="space-y-2">
                  {sessionFeedback.areas_to_improve.map((a: string, i: number) => (
                    <li key={i} className="text-sm text-neutral-300 flex gap-2.5 leading-relaxed">
                      <span className="text-orange-600 mt-0.5 shrink-0">~</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI disclaimer */}
            <p className="text-[11px] text-neutral-600 text-center leading-relaxed px-4">
              This analysis is generated by AI based on your voice input during rehearsal. Use it as a starting point, not a final verdict. Trust yourself, keep rehearsing, and consider working with a coach for deeper training.
            </p>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                className="flex-1 border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                onClick={handleExit}
              >
                Back to Script
              </Button>
              <Button
                className="flex-1"
                onClick={handleRestart}
                disabled={isRestarting}
              >
                {isRestarting ? 'Starting...' : 'Rehearse Again'}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ── Render: main rehearsal view ───────────────────────────────── */

  return (
    <div className={cn('fixed inset-0 bg-neutral-950 text-neutral-100 flex flex-col z-[10050] transition-opacity duration-150', exiting && 'opacity-0')}>
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
      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div
          className="max-w-4xl mx-auto bg-white text-neutral-900 rounded-lg shadow-2xl border border-neutral-200 px-4 sm:px-6 py-5 sm:py-7"
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {sceneWithLines ? (
            <>
              {/* Script header */}
              <div className="text-center mb-6 pb-5 border-b border-neutral-200">
                <h1 className="text-xl font-bold uppercase tracking-wider text-neutral-900">
                  {sceneWithLines.title}
                </h1>
                {sceneWithLines.description?.trim() && (
                  <p className="text-sm italic text-neutral-600 mt-1">{sceneWithLines.description}</p>
                )}
                <p className="text-sm text-neutral-700 mt-1.5">
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
                      ref={isCurrent ? currentLineRef : undefined}
                      initial={false}
                      animate={isCurrentUserLine && shouldShake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
                      transition={{ duration: 0.4, ease: 'easeInOut' }}
                      className={cn(
                        'rounded-lg px-3 sm:px-4 py-3 transition-all duration-200',
                        !isCurrent && 'opacity-55 cursor-pointer hover:opacity-75',
                        isCurrentUserLine && 'bg-orange-50/80 ring-1 ring-orange-200/60',
                        isCurrentAiLine && 'bg-neutral-100/60 ring-1 ring-neutral-200/60',
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
                      <p className="text-[17px] font-normal leading-relaxed text-neutral-800 text-center break-words whitespace-pre-wrap">
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
                            className="text-[11px] text-neutral-400 hover:text-neutral-600 transition-colors"
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
    </div>
  );
}
