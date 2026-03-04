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
  RotateCcw,
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
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useSpeechSynthesis } from '@/hooks/useSpeechSynthesis';
import { useOpenAITTS } from '@/hooks/useOpenAITTS';
import {
  getRehearsalSettings,
  type RehearsalSettings,
} from '@/lib/scenepartnerStorage';
import { MicAccessWarning } from '@/components/scenepartner/MicAccessWarning';
import { TTSWaveform } from '@/components/scenepartner/TTSWaveform';
import { parseUpgradeError } from '@/lib/upgradeError';
import { UpgradeModal } from '@/components/billing/UpgradeModal';
import { cn } from '@/lib/utils';

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
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [linesRemaining, setLinesRemaining] = useState<number | null>(null); // tracked for API but not displayed
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<any>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; feature: string; message: string }>({
    open: false, feature: "", message: "",
  });
  const [exiting, setExiting] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);

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

  /* ── Speech recognition ────────────────────────────────────────── */

  const {
    transcript: liveTranscript,
    isListening,
    isSupported: isSpeechRecognitionSupported,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    continuous: true,
    interimResults: true,
    onResult: (text) => {
      gotResultRef.current = true;
      stopListening();
      handleDeliverLine(text);
      resetTranscript();
    },
    onEnd: () => {
      // Retry if recognition ended without a result (silence timeout)
      if (!gotResultRef.current) {
        setAutoListenLineKey(null);
      }
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
    // Short pause between consecutive AI lines (300ms), user-configured pause before user's turn
    const pauseMs = nextIsAlsoAI ? 300 : (rehearsalSettings.pauseBetweenLinesSeconds ?? 0) * 1000;
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

  const speakLine = useCallback((text: string) => {
    if (isListening) stopListening();
    lastAiLineForFallbackRef.current = text;
    if (useAIVoice) {
      speakAI(text, lastKnownVoiceIdRef.current, '');
    } else if (isSpeechSynthesisSupported) {
      speakBrowser(text);
    }
  }, [useAIVoice, speakAI, speakBrowser, isSpeechSynthesisSupported, isListening, stopListening]);
  const speakLineRef = useRef(speakLine);
  speakLineRef.current = speakLine;

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
      // AI's turn — speak it from script
      setLastAiLine(line.text);
      setAutoListenLineKey(null);
      speakLineRef.current(line.text);
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
    if (!toSend || isProcessing || !sess) return;
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
      try {
        const sceneRes = await api.get<SceneWithLines>(`/api/scenes/${data.scene_id}`);
        setSceneWithLines(sceneRes.data);
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

  // Auto-start: begin script from the first line
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (countdown !== null) return;
    if (paused) return;
    if (!focusInitialized || !session || !orderedLines.length) return;

    autoStartedRef.current = true;
    setActiveLineIndex(0);
    const firstLine = orderedLines[0];

    if (firstLine.character_name === session.ai_character) {
      setLastAiLine(firstLine.text);
      speakLineRef.current(firstLine.text);
    } else {
      // User's first line — auto-listen will handle
      setLastAiLine(null);
    }
  }, [countdown, paused, focusInitialized, session?.id, orderedLines.length]);

  // Auto-listen when it's user's turn
  useEffect(() => {
    const isUserTurn = currentUserLineText != null && lastAiLine == null;
    const canAutoListen =
      !showFeedback &&
      !paused &&
      isUserTurn &&
      isSpeechRecognitionSupported &&
      !isListening &&
      !anySpeaking &&
      !isProcessing &&
      (countdown === null || countdown <= 0) &&
      activeUserLineKey !== null &&
      autoListenLineKey !== activeUserLineKey;
    if (!canAutoListen) return;

    setAutoListenLineKey(activeUserLineKey);
    gotResultRef.current = false;
    // Short delay to let TTS audio fully release the mic
    const t = setTimeout(() => startListening(), 300);
    return () => clearTimeout(t);
  }, [
    showFeedback, paused, currentUserLineText, lastAiLine,
    isSpeechRecognitionSupported, isListening, anySpeaking, isProcessing,
    countdown, activeUserLineKey, autoListenLineKey, startListening,
  ]);

  // Bulk preload: cache first several AI lines when scene loads
  const bulkPreloadedRef = useRef(false);
  useEffect(() => {
    if (bulkPreloadedRef.current || !session || !orderedLines.length) return;
    bulkPreloadedRef.current = true;
    const aiLines = orderedLines
      .filter(l => l.character_name === session.ai_character)
      .slice(0, 5); // preload first 5 AI lines
    aiLines.forEach(l => preloadTTS(l.text, lastKnownVoiceIdRef.current, ''));
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
        preloadTTS(orderedLines[i].text, lastKnownVoiceIdRef.current, '');
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
    stopAllAudio();
  }, [stopAllAudio]);

  const handleResume = useCallback(() => {
    setPaused(false);
    // Re-speak current AI line if it was interrupted
    if (activeLineIndex != null && lastAiLine) {
      const line = orderedLinesRef.current[activeLineIndex];
      if (line && line.character_name === session?.ai_character) {
        speakLine(line.text);
      }
    }
  }, [activeLineIndex, lastAiLine, session?.ai_character, speakLine]);

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
    if (paused) setPaused(false);
    advanceScriptRef.current(lineIndex);
  }, [paused, stopAllAudio]);

  // Manual tap-to-advance: if speech recognition fails, user can tap their line
  const handleManualAdvance = useCallback(() => {
    if (!currentUserLineText || isProcessing) return;
    if (isListening) stopListening();
    handleDeliverLine(currentUserLineText);
  }, [currentUserLineText, isProcessing, isListening, stopListening]);

  /* ── Derived state ─────────────────────────────────────────────── */

  const isUserTurn = currentUserLineText != null && lastAiLine == null;

  const statusInfo = (() => {
    if (isLoadingAI) return { text: 'Generating voice', color: 'bg-amber-400', pulse: true };
    if (anySpeaking) return { text: `${session?.ai_character ?? 'Partner'} speaking`, color: 'bg-amber-400', pulse: true };
    if (isListening) return { text: 'Listening', color: 'bg-green-400', pulse: true };
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
              <p className="text-neutral-500 text-sm">Preparing rehearsal...</p>
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
            className="w-full max-w-md space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto">
                <Trophy className="h-7 w-7 text-yellow-500" />
              </div>
              <h1 className="text-xl font-semibold">Scene Complete</h1>
              <p className="text-sm text-neutral-400">Here&apos;s your performance feedback</p>
            </div>

            <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Star className="h-4 w-4 text-yellow-500" />
                Overall
              </div>
              <p className="text-sm text-neutral-300 leading-relaxed">
                {sessionFeedback.overall_feedback}
              </p>
            </div>

            {sessionFeedback.strengths?.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Check className="h-4 w-4 text-emerald-400" />
                  Strengths
                </div>
                <ul className="space-y-1.5">
                  {sessionFeedback.strengths.map((s: string, i: number) => (
                    <li key={i} className="text-sm text-neutral-300 flex gap-2">
                      <span className="text-neutral-600">-</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sessionFeedback.areas_to_improve?.length > 0 && (
              <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-orange-400" />
                  Growth Opportunities
                </div>
                <ul className="space-y-1.5">
                  {sessionFeedback.areas_to_improve.map((a: string, i: number) => (
                    <li key={i} className="text-sm text-neutral-300 flex gap-2">
                      <span className="text-neutral-600">-</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3 pt-2">
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
          className="max-w-4xl mx-auto bg-white text-neutral-950 rounded-lg shadow-2xl border border-neutral-200 px-5 sm:px-12 py-6 sm:py-10"
          style={{ fontFamily: '"Courier New", Courier, monospace' }}
        >
          {sceneWithLines ? (
            <>
              {/* Script header */}
              <div className="text-center mb-8 pb-6 border-b border-neutral-300">
                <h1 className="text-2xl font-bold uppercase tracking-wider text-neutral-950">
                  {sceneWithLines.title}
                </h1>
                {sceneWithLines.description?.trim() && (
                  <p className="text-base italic text-neutral-700 mt-2">{sceneWithLines.description}</p>
                )}
                <p className="text-base text-neutral-800 mt-2">
                  from <span className="text-neutral-950 font-semibold">{sceneWithLines.play_title}</span>
                  {sceneWithLines.play_author && (
                    <>{' '}by <span className="text-neutral-950 font-semibold">{sceneWithLines.play_author}</span></>
                  )}
                </p>
              </div>

              {/* Script lines */}
              <div className="space-y-5">
                {orderedLines.map((line, lineIdx) => {
                  const isCurrent = lineIdx === activeLineIndex;
                  const isUser = line.character_name === session.user_character;
                  const isCurrentUserLine = isCurrent && isUser;
                  const isCurrentAiLine = isCurrent && !isUser;

                  // Word-by-word highlighting (works while listening AND briefly after)
                  const expectedWords = isCurrentUserLine ? line.text.split(/\s+/).filter(Boolean) : [];
                  const spokenWords = isCurrentUserLine && liveTranscript
                    ? liveTranscript.split(/\s+/).filter(Boolean)
                    : [];
                  const highlightCount = spokenWords.length;

                  return (
                    <div
                      key={line.id}
                      ref={isCurrent ? currentLineRef : undefined}
                      className={cn(
                        'rounded-md px-4 py-3 transition-all duration-300 cursor-pointer',
                        isCurrent
                          ? 'bg-amber-50 ring-2 ring-primary/40 ring-offset-1 ring-offset-white'
                          : 'opacity-50 hover:opacity-75'
                      )}
                      onClick={() => {
                        if (isCurrentUserLine && isUserTurn) {
                          // Tap current user line to manually advance
                          handleManualAdvance();
                        } else {
                          handleJumpToLine(lineIdx);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {/* Character name + indicators */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base font-bold uppercase tracking-widest text-neutral-950">
                          {line.character_name}
                        </span>
                        {isUser && (
                          <span className="text-[11px] font-semibold text-primary tracking-wider">(YOU)</span>
                        )}
                        {/* AI speaking: pulsing dots */}
                        {isCurrentAiLine && anySpeaking && (
                          <span className="flex items-center gap-[3px] ml-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
                          </span>
                        )}
                        {/* User listening: mic icon with sound bars */}
                        {isCurrentUserLine && isListening && (
                          <span className="flex items-center gap-1.5 ml-1">
                            <span className="relative flex items-center justify-center w-5 h-5">
                              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                              <Mic className="relative h-3.5 w-3.5 text-primary" />
                            </span>
                            {/* Mini sound bars */}
                            <span className="flex items-center gap-[2px] h-4">
                              <span className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '40%', animationDelay: '0ms' }} />
                              <span className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '70%', animationDelay: '150ms' }} />
                              <span className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '100%', animationDelay: '300ms' }} />
                              <span className="w-[2px] bg-primary rounded-full animate-pulse" style={{ height: '55%', animationDelay: '450ms' }} />
                            </span>
                            <span className="text-[10px] font-medium text-primary">Listening...</span>
                          </span>
                        )}
                        {/* User's turn but not yet listening */}
                        {isCurrentUserLine && isUserTurn && !isListening && !anySpeaking && (
                          <span className="flex items-center gap-1 ml-1">
                            <Mic className="h-3.5 w-3.5 text-neutral-400" />
                            <span className="text-[10px] text-neutral-500">Your turn</span>
                          </span>
                        )}
                      </div>

                      {/* Stage direction — only if non-empty */}
                      {line.stage_direction?.trim() && (
                        <p className="text-sm italic text-neutral-600 mb-1.5">
                          ({line.stage_direction.trim()})
                        </p>
                      )}

                      {/* Line text */}
                      <p className="text-lg leading-relaxed text-neutral-950">
                        {isCurrentUserLine && highlightCount > 0
                          ? expectedWords.map((word, i) => (
                              <span
                                key={i}
                                className={cn(
                                  'transition-colors duration-150',
                                  i < highlightCount ? 'text-primary font-semibold' : 'text-neutral-950'
                                )}
                              >
                                {word}{i < expectedWords.length - 1 ? ' ' : ''}
                              </span>
                            ))
                          : line.text
                        }
                      </p>

                      {/* Live transcript feedback — shows what mic is capturing */}
                      {isCurrentUserLine && isListening && liveTranscript && (
                        <p className="text-xs text-primary/70 mt-2 italic border-l-2 border-primary/30 pl-2">
                          {liveTranscript}
                        </p>
                      )}

                      {/* Tap to advance hint / auto-skip info */}
                      {isCurrentUserLine && isUserTurn && !isListening && !anySpeaking && (
                        <p className="text-xs text-primary/60 mt-1.5 italic">
                          Tap to skip {rehearsalSettings.skipMyLineIfSilent ? `(auto-skip in ${rehearsalSettings.skipAfterSeconds}s)` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-neutral-500 text-sm text-center py-8">Loading script...</p>
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

          {/* Restart */}
          <button
            type="button"
            onClick={() => { handlePause(); setShowRestartModal(true); }}
            disabled={isRestarting}
            className="h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center gap-1.5 px-3 transition-colors shrink-0 disabled:opacity-50"
            title="Restart scene from beginning"
          >
            {isRestarting
              ? <div className="w-3.5 h-3.5 rounded-full border-2 border-neutral-600 border-t-neutral-300 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
            }
            <span className="text-[10px] text-neutral-400">Restart</span>
          </button>

          {/* Status indicator — fixed width to prevent layout shift */}
          <div className="flex items-center gap-1.5 w-[105px] shrink-0">
            <div className={cn('w-2 h-2 rounded-full shrink-0', statusInfo.color, statusInfo.pulse && 'animate-pulse')} />
            <span className="text-[11px] text-neutral-400 whitespace-nowrap truncate">{statusInfo.text}</span>
          </div>

          {/* Waveform (always rendered to avoid layout shift) */}
          <div className={cn('w-16 h-5 shrink-0 transition-opacity duration-200', (isSpeakingAI || isLoadingAI) ? 'opacity-100' : 'opacity-0')}>
            <TTSWaveform
              audioElement={aiAudioRef.current}
              isLoading={isLoadingAI}
              isSpeaking={isSpeakingAI}
              className="w-full h-full"
            />
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
            onClick={() => { stopAllAudio(); setShowExitModal(true); }}
            className="w-9 h-9 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            title="Exit rehearsal"
          >
            <X className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Restart confirmation modal */}
      <Dialog open={showRestartModal} onOpenChange={setShowRestartModal}>
        <DialogContent className="bg-neutral-900 border-neutral-800 text-neutral-100 max-w-xs">
          <DialogHeader>
            <DialogTitle>Restart Scene?</DialogTitle>
            <DialogDescription className="text-neutral-400">
              This will restart the rehearsal from the beginning.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-neutral-700 text-neutral-200 hover:bg-neutral-800"
              onClick={() => {
                setShowRestartModal(false);
                handleResume();
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={isRestarting}
              onClick={() => {
                setShowRestartModal(false);
                handleRestart();
              }}
            >
              {isRestarting ? 'Restarting...' : 'Restart'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exit confirmation modal */}
      <Dialog open={showExitModal} onOpenChange={setShowExitModal}>
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
              onClick={() => setShowExitModal(false)}
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

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
      />
    </div>
  );
}
