'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { useSubscription } from '@/hooks/useSubscription';
import { extractVideoFrames } from '@/utils/extractVideoFrames';
import api, { API_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  IconPlayerRecord,
  IconPlayerStop,
  IconPlayerPlay,
  IconPlayerPause,
  IconRefresh,
  IconDownload,
  IconSparkles,
  IconCamera,
  IconGridDots,
  IconLock,
  IconArrowRight,
  IconDeviceFloppy,
  IconShare,
  IconStarFilled,
  IconAlertCircle,
  IconSettings,
  IconX,
  IconInfoCircle,
  IconArrowLeft,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Tier limits
const FEEDBACK_LIMITS: Record<string, number> = { free: 1, solo: 10, plus: 30, pro: 60 };
const SAVE_LIMITS: Record<string, number> = { free: 0, solo: 0, plus: 15, pro: 50 };

type PageState = 'setup' | 'preview' | 'countdown' | 'recording' | 'recorded';

function getNextResetDate(): string {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysUntil = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 1) return 'tomorrow';
  if (daysUntil <= 7) return `in ${daysUntil} days`;
  return nextMonth.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export default function AuditionModePage() {
  const router = useRouter();
  const { subscription } = useSubscription();
  const userTier = subscription?.tier_name || 'free';
  const feedbackLimit = FEEDBACK_LIMITS[userTier] || 1;
  const saveLimit = SAVE_LIMITS[userTier] || 0;

  const [mounted, setMounted] = useState(false);
  const [pageState, setPageState] = useState<PageState>('setup');
  const [showGrid, setShowGrid] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackUsedThisMonth, setFeedbackUsedThisMonth] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AuditionFeedback | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [showFeedbackTooltip, setShowFeedbackTooltip] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedTapeId, setSavedTapeId] = useState<number | null>(null);

  // Settings
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [countdownDuration, setCountdownDuration] = useState(3);
  const [showSettings, setShowSettings] = useState(false);

  // Camera preview (separate from recording)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewStreamRef = useRef<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingVideoElRef = useRef<HTMLVideoElement | null>(null);
  const videoPlaybackRef = useRef<HTMLVideoElement>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isRecording,
    isPaused,
    recordedBlob,
    recordedUrl,
    duration,
    isSupported,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
    stream,
  } = useVideoRecorder({
    onRecordingComplete: () => {
      setPageState('recorded');
    },
    onError: (error) => {
      console.error('Recording error:', error);
    },
  });

  useEffect(() => setMounted(true), []);

  // Fetch feedback usage on mount
  useEffect(() => {
    api.get<{ used: number }>('/api/audition/usage')
      .then(({ data }) => setFeedbackUsedThisMonth(data.used))
      .catch(() => {}); // Silently fail — defaults to 0
  }, []);

  // Start camera preview when entering preview/setup state
  const startPreview = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      previewStreamRef.current = mediaStream;
      setPreviewStream(mediaStream);
    } catch {
      // Camera not available
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((t) => t.stop());
      previewStreamRef.current = null;
      setPreviewStream(null);
    }
  }, []);

  // Auto-start camera preview on mount
  useEffect(() => {
    if (mounted && pageState === 'setup') {
      startPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Attach preview stream to video element
  useEffect(() => {
    if (previewVideoRef.current && previewStream) {
      previewVideoRef.current.srcObject = previewStream;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [previewStream]);

  // Track recording stream in ref & kill preview once recording stream is ready
  useEffect(() => {
    if (stream) {
      recordingStreamRef.current = stream;
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
        setPreviewStream(null);
      }
      // Attach to element if already mounted
      if (recordingVideoElRef.current) {
        recordingVideoElRef.current.srcObject = stream;
        recordingVideoElRef.current.play().catch(() => {});
      }
    }
  }, [stream]);

  // Callback ref for recording video — handles AnimatePresence timing
  const recordingVideoRef = useCallback((el: HTMLVideoElement | null) => {
    recordingVideoElRef.current = el;
    if (el && recordingStreamRef.current) {
      el.srcObject = recordingStreamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // Attach recorded video to playback element
  useEffect(() => {
    if (videoPlaybackRef.current && recordedUrl) {
      videoPlaybackRef.current.src = recordedUrl;
    }
  }, [recordedUrl]);

  // Cleanup all camera streams on unmount
  useEffect(() => {
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach((t) => t.stop());
        previewStreamRef.current = null;
      }
    };
  }, []);

  const handleStartCountdown = useCallback(() => {
    if (!countdownEnabled) {
      setPageState('recording');
      startRecording();
      return;
    }
    setPageState('countdown');
    setCountdown(countdownDuration);

    let count = countdownDuration;
    countdownRef.current = setInterval(() => {
      count -= 1;
      setCountdown(count);
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setPageState('recording');
        startRecording();
      }
    }, 1000);
  }, [countdownEnabled, countdownDuration, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setPageState('recorded');
  }, [stopRecording]);

  const handleReRecord = useCallback(() => {
    clearRecording();
    setFeedback(null);
    setShowFeedback(false);
    setSavedTapeId(null);
    setAnalysisError(null);
    setPageState('setup');
    startPreview();
  }, [clearRecording, startPreview]);

  const handleDownload = useCallback(() => {
    if (!recordedBlob || !recordedUrl) return;
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `self-tape-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [recordedBlob, recordedUrl]);

  const handleGetFeedback = useCallback(async () => {
    if (!recordedBlob) return;
    if (feedbackUsedThisMonth >= feedbackLimit) return;
    setIsAnalyzing(true);
    setShowFeedback(true);
    setAnalysisError(null);

    try {
      // Extract 6 frames from the recorded video
      const frames = await extractVideoFrames(recordedBlob, 6, 0.7);

      // Send frames to the real AI analysis API
      const { data } = await api.post<{
        rating: number;
        overall_notes: string;
        line_accuracy: string;
        pacing: string;
        emotional_tone: string;
        framing: string;
        tips: string[];
      }>('/api/audition/analyze', {
        frames,
        duration,
      }, { timeoutMs: 30000 });

      setFeedback({
        rating: data.rating,
        summary: data.overall_notes,
        performance: data.emotional_tone,
        pacingAndDelivery: data.pacing || data.line_accuracy,
        framingAndSetup: data.framing,
        tips: data.tips || [],
      });
      setFeedbackUsedThisMonth((prev) => prev + 1);
    } catch (err: any) {
      const msg = err?.message || 'Analysis failed. Please try again.';
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  }, [recordedBlob, duration, feedbackUsedThisMonth, feedbackLimit]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!recordedBlob || isSaving || savedTapeId) return;
    setIsSaving(true);

    try {
      const formData = new FormData();
      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      formData.append('file', recordedBlob, `self-tape.${ext}`);
      formData.append('duration_seconds', String(duration));
      if (feedback) {
        formData.append('ai_feedback', JSON.stringify(feedback));
      }

      // Use fetch directly for multipart (api helper assumes JSON)
      const token = document.cookie.match(/sb-.*-auth-token/)?.[0]; // handled by api helper
      const { data: session } = await (await import('@/lib/supabase')).supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/tapes/upload`, {
        method: 'POST',
        headers: session?.session?.access_token
          ? { Authorization: `Bearer ${session.session.access_token}` }
          : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save tape');
      }

      const tape = await res.json();
      setSavedTapeId(tape.id);
    } catch (err: any) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, [recordedBlob, duration, feedback, isSaving, savedTapeId]);

  const feedbackRemaining = feedbackLimit - feedbackUsedThisMonth;
  const canSave = saveLimit > 0;
  const canShare = userTier === 'pro';

  if (mounted && !isSupported) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <IconAlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Browser Not Supported</h1>
          <p className="text-white/40">
            Your browser doesn&apos;t support video recording. Please use Chrome, Firefox, or Safari on desktop.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Studio atmosphere */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-orange-500/[0.04] blur-[120px]" />
      <div className="pointer-events-none absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full bg-blue-400/[0.03] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 w-[800px] h-[300px] rounded-full bg-amber-500/[0.02] blur-[80px]" />
      {/* Film grain */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />
      {/* Vignette */}
      <div className="pointer-events-none fixed inset-0 z-40" style={{ boxShadow: 'inset 0 0 150px 60px rgba(0,0,0,0.5)' }} />

      <div className="relative z-10 px-4 lg:px-6 py-4 max-w-[1600px] mx-auto">
        {/* Immersive Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-4"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              title="Exit Audition Mode"
            >
              <IconArrowLeft className="w-5 h-5 text-white/70" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Audition Mode</h1>
              <p className="text-xs text-white/40">Record your self-tape, get AI feedback</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowFeedbackTooltip(!showFeedbackTooltip)}
                onMouseEnter={() => setShowFeedbackTooltip(true)}
                onMouseLeave={() => setShowFeedbackTooltip(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm transition-colors hover:bg-white/10"
              >
                <IconSparkles className="w-3.5 h-3.5 text-primary" />
                <span className="font-medium text-primary">{feedbackRemaining}</span>
                <span className="text-white/40 text-xs hidden sm:inline">feedback left</span>
                <IconInfoCircle className="w-3 h-3 text-white/30" />
              </button>
              <AnimatePresence>
                {showFeedbackTooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute right-0 top-full mt-2 w-64 p-3 rounded-lg border border-white/10 bg-neutral-900 shadow-lg z-20"
                  >
                    <p className="text-xs font-medium text-white mb-1">AI Feedback Credits</p>
                    <p className="text-xs text-white/50 mb-2">
                      After recording, our AI casting director analyzes your performance — pacing, emotion, framing, and more.
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/40">
                        {feedbackUsedThisMonth}/{feedbackLimit} used this month
                      </span>
                      {feedbackRemaining <= 0 && (
                        <Link href="/pricing" className="text-primary font-medium hover:underline">
                          Get more
                        </Link>
                      )}
                    </div>
                    <div className="mt-2 pt-2 border-t border-white/10 text-xs text-white/30">
                      Resets {getNextResetDate()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-4">
          {/* Main Recording Area */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex-1"
          >
            {/* Video Container */}
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video border border-white/10">
              <AnimatePresence mode="wait">
                {/* Setup State — Live camera preview */}
                {pageState === 'setup' && (
                  <motion.div
                    key="setup"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                  >
                    {previewStream ? (
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-black/95">
                        <IconCamera className="w-10 h-10 text-white/20 mb-3" />
                        <p className="text-sm text-white/30">Requesting camera access...</p>
                      </div>
                    )}

                    {/* Framing Grid */}
                    {showGrid && previewStream && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                          {[...Array(9)].map((_, i) => (
                            <div key={i} className="border border-white/10" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top controls */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <button
                        onClick={() => setShowGrid(!showGrid)}
                        className="p-2 rounded-lg bg-black/40 hover:bg-black/60 transition-colors"
                        title="Toggle framing grid"
                      >
                        <IconGridDots className={`w-5 h-5 ${showGrid ? 'text-primary' : 'text-white/60'}`} />
                      </button>
                      <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-2 rounded-lg bg-black/40 hover:bg-black/60 transition-colors"
                        title="Recording settings"
                      >
                        <IconSettings className={`w-5 h-5 ${showSettings ? 'text-primary' : 'text-white/60'}`} />
                      </button>
                    </div>

                    {/* Settings panel */}
                    <AnimatePresence>
                      {showSettings && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          className="absolute top-4 right-16 w-64 rounded-lg border border-white/10 bg-black/80 backdrop-blur-md p-4 z-10"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-white">Settings</p>
                            <button onClick={() => setShowSettings(false)}>
                              <IconX className="w-4 h-4 text-white/40 hover:text-white/80" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-xs text-white/70">Countdown</label>
                            <button
                              onClick={() => setCountdownEnabled(!countdownEnabled)}
                              className={`w-9 h-5 rounded-full transition-colors relative ${countdownEnabled ? 'bg-primary' : 'bg-white/20'}`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${countdownEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                          {countdownEnabled && (
                            <div className="flex items-center justify-between mb-3">
                              <label className="text-xs text-white/70">Duration</label>
                              <div className="flex items-center gap-1">
                                {[3, 5, 10].map((d) => (
                                  <button
                                    key={d}
                                    onClick={() => setCountdownDuration(d)}
                                    className={`px-2 py-0.5 rounded text-xs transition-colors ${countdownDuration === d ? 'bg-primary text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
                                  >
                                    {d}s
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-white/70">Framing grid</label>
                            <button
                              onClick={() => setShowGrid(!showGrid)}
                              className={`w-9 h-5 rounded-full transition-colors relative ${showGrid ? 'bg-primary' : 'bg-white/20'}`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showGrid ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Bottom — Record button */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pt-16 pb-6">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-sm text-white/50">Position yourself in frame, then hit record</p>
                        <div className="relative">
                          <motion.div
                            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-full bg-red-500/20 blur-sm"
                          />
                          <Button
                            size="lg"
                            onClick={handleStartCountdown}
                            className="relative gap-2 px-8 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg shadow-red-600/40"
                          >
                            <IconPlayerRecord className="w-5 h-5" />
                            Record
                          </Button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Countdown State */}
                {pageState === 'countdown' && (
                  <motion.div
                    key="countdown"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                  >
                    {previewStream && (
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={countdown}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="text-[10rem] lg:text-[12rem] font-light text-white/80 tabular-nums leading-none select-none"
                        >
                          {countdown}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}

                {/* Recording State — Live Camera Feed */}
                {pageState === 'recording' && (
                  <motion.div
                    key="recording"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                  >
                    <video
                      ref={recordingVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />

                    {showGrid && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                          {[...Array(9)].map((_, i) => (
                            <div key={i} className="border border-white/10" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tally light recording indicator */}
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-sm">
                      <div className="relative">
                        <motion.div
                          animate={{ opacity: [0.6, 0.2, 0.6], scale: [1, 1.8, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="absolute inset-0 rounded-full bg-red-500 blur-sm"
                        />
                        <motion.div
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                          className="relative w-2.5 h-2.5 rounded-full bg-red-500"
                        />
                      </div>
                      <span className="text-white text-sm font-mono font-medium tracking-wider">
                        {formatTime(duration)}
                      </span>
                    </div>

                    {isPaused && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2"
                      >
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">PAUSED</Badge>
                      </motion.div>
                    )}

                    <button
                      onClick={() => setShowGrid(!showGrid)}
                      className="absolute top-4 right-4 p-2 rounded-lg bg-black/40 hover:bg-black/60 transition-colors"
                    >
                      <IconGridDots className={`w-5 h-5 ${showGrid ? 'text-primary' : 'text-white/60'}`} />
                    </button>

                    {/* Bottom Controls */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 pb-6">
                      <div className="flex items-center justify-center gap-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={isPaused ? resumeRecording : pauseRecording}
                          className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
                        >
                          {isPaused ? <IconPlayerPlay className="w-5 h-5" /> : <IconPlayerPause className="w-5 h-5" />}
                        </Button>
                        <Button
                          onClick={handleStopRecording}
                          className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30"
                        >
                          <IconPlayerStop className="w-7 h-7" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowGrid(!showGrid)}
                          className="h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 text-white lg:hidden"
                        >
                          <IconGridDots className={`w-5 h-5 ${showGrid ? 'text-primary' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Recorded State — Playback */}
                {pageState === 'recorded' && recordedUrl && (
                  <motion.div
                    key="recorded"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                  >
                    <video
                      src={recordedUrl}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Post-recording toolbar — under the video */}
            <AnimatePresence>
              {pageState === 'recorded' && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="mt-3 flex items-center gap-3"
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleReRecord}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
                    >
                      <IconRefresh className="w-4 h-4" />
                      New take
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
                    >
                      <IconDownload className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                  <div className="flex-1" />
                  <span className="text-xs text-white/30 font-mono">{formatTime(duration)}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Right Sidebar — appears after recording */}
          <AnimatePresence>
            {pageState === 'recorded' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="w-full lg:w-[360px] shrink-0"
              >
                <div className="lg:sticky lg:top-4 space-y-3">
                  {/* AI Feedback — Primary CTA */}
                  {feedbackRemaining > 0 ? (
                    duration >= 30 ? (
                      <motion.button
                        onClick={handleGetFeedback}
                        disabled={isAnalyzing}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className="w-full p-5 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/25 text-left transition-colors hover:border-primary/40 disabled:opacity-60 disabled:pointer-events-none"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-primary/25 flex items-center justify-center shrink-0">
                            {isAnalyzing ? (
                              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                                <IconSparkles className="w-5 h-5 text-primary" />
                              </motion.div>
                            ) : (
                              <IconSparkles className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white">
                              {isAnalyzing ? 'Analyzing your take...' : 'Get AI Director Notes'}
                            </p>
                            <p className="text-xs text-white/40 mt-1 leading-relaxed">
                              {isAnalyzing
                                ? 'Reviewing pacing, emotion, framing & delivery'
                                : 'Personalized notes on pacing, emotion, framing & delivery'}
                            </p>
                          </div>
                        </div>
                        {!isAnalyzing && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                            <span className="text-[11px] text-white/25">{feedbackRemaining} credit{feedbackRemaining !== 1 ? 's' : ''} remaining</span>
                            <span className="text-xs font-medium text-primary">Analyze &rarr;</span>
                          </div>
                        )}
                      </motion.button>
                    ) : (
                      <div className="w-full p-5 rounded-xl bg-white/[0.02] border border-white/5">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                            <IconSparkles className="w-5 h-5 text-white/15" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white/25">AI Director Notes</p>
                            <p className="text-xs text-white/15 mt-1 leading-relaxed">
                              Record at least 30 seconds to get personalized feedback on your performance.
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  ) : (
                    <Link
                      href="/pricing"
                      className="block w-full p-5 rounded-xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                          <IconLock className="w-5 h-5 text-white/25" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white/40">No credits remaining</p>
                          <p className="text-xs text-primary/60 mt-1">Upgrade your plan for more AI feedback &rarr;</p>
                        </div>
                      </div>
                    </Link>
                  )}

                  {/* AI Feedback Results */}
                  <AnimatePresence>
                    {showFeedback && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden"
                      >
                        <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02]">
                          <div className="flex items-center gap-2.5">
                            <IconSparkles className="w-5 h-5 text-primary" />
                            <h3 className="font-semibold text-lg text-white">Director Notes</h3>
                          </div>
                        </div>
                        <div className="p-5 space-y-5">
                          {analysisError ? (
                            <div className="text-center py-4">
                              <IconAlertCircle className="w-8 h-8 text-red-400/50 mx-auto mb-2" />
                              <p className="text-sm text-white/50 mb-3">{analysisError}</p>
                              <Button size="sm" variant="ghost" onClick={handleGetFeedback} className="text-primary hover:text-primary">
                                Try again
                              </Button>
                            </div>
                          ) : isAnalyzing ? (
                            <FeedbackSkeleton />
                          ) : feedback ? (
                            <>
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0 }}
                              >
                                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Overall Rating</p>
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star, i) => (
                                    <motion.div
                                      key={star}
                                      initial={{ opacity: 0, scale: 0.5 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{ duration: 0.3, delay: 0.1 + i * 0.08 }}
                                    >
                                      <IconStarFilled
                                        className={`w-5 h-5 ${star <= feedback.rating ? 'text-primary' : 'text-white/10'}`}
                                      />
                                    </motion.div>
                                  ))}
                                  <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.6 }}
                                    className="ml-2 text-sm font-medium text-white"
                                  >
                                    {feedback.rating}/5
                                  </motion.span>
                                </div>
                              </motion.div>
                              <FeedbackSection title="Summary" content={feedback.summary} delay={0.15} />
                              <FeedbackSection title="Performance & Presence" content={feedback.performance} delay={0.25} />
                              <FeedbackSection title="Pacing & Delivery" content={feedback.pacingAndDelivery} delay={0.35} />
                              <FeedbackSection title="Framing & Setup" content={feedback.framingAndSetup} delay={0.45} />
                              <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: 0.55 }}
                              >
                                <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">For Your Next Take</p>
                                <ul className="space-y-2">
                                  {feedback.tips.map((tip, i) => (
                                    <motion.li
                                      key={i}
                                      initial={{ opacity: 0, x: -8 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ duration: 0.3, delay: 0.65 + i * 0.1 }}
                                      className="flex gap-2 text-sm text-white/70"
                                    >
                                      <IconArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                      {tip}
                                    </motion.li>
                                  ))}
                                </ul>
                              </motion.div>
                            </>
                          ) : null}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Save & Share — secondary */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] divide-y divide-white/5">
                    {canSave ? (
                      savedTapeId ? (
                        <Link href="/my-tapes" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors">
                          <IconDeviceFloppy className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-green-400 flex-1">Saved to Library</span>
                          <IconArrowRight className="w-3.5 h-3.5 text-white/30" />
                        </Link>
                      ) : (
                        <button
                          onClick={handleSaveToLibrary}
                          disabled={isSaving}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                        >
                          <IconDeviceFloppy className={`w-4 h-4 ${isSaving ? 'text-white/25 animate-pulse' : 'text-white/50'}`} />
                          <span className="text-sm text-white/60 flex-1">
                            {isSaving ? 'Saving...' : 'Save to Library'}
                          </span>
                        </button>
                      )
                    ) : (
                      <Link href="/pricing" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <IconDeviceFloppy className="w-4 h-4 text-white/20" />
                        <span className="text-sm text-white/30 flex-1">Save to Library</span>
                        <span className="text-[10px] text-white/15">Plus</span>
                      </Link>
                    )}
                    {canShare ? (
                      <button disabled className="w-full flex items-center gap-3 px-4 py-3 text-left">
                        <IconShare className="w-4 h-4 text-white/25" />
                        <span className="text-sm text-white/30 flex-1">Share with Casting</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Soon</Badge>
                      </button>
                    ) : (
                      <Link href="/pricing" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <IconShare className="w-4 h-4 text-white/20" />
                        <span className="text-sm text-white/30 flex-1">Share with Casting</span>
                        <span className="text-[10px] text-white/15">Pro</span>
                      </Link>
                    )}
                  </div>

                  {/* Tier Upsell — free users */}
                  {userTier === 'free' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="rounded-xl border border-primary/15 p-4 bg-primary/[0.04]"
                    >
                      <p className="font-medium text-sm text-white">Unlock your full potential</p>
                      <p className="text-xs text-white/35 mt-1 mb-3">
                        More AI notes, cloud saves, shareable links for casting directors.
                      </p>
                      <Button asChild size="sm" className="gap-2 w-full">
                        <Link href="/pricing">
                          View Plans
                          <IconArrowRight className="w-4 h-4" />
                        </Link>
                      </Button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

interface AuditionFeedback {
  rating: number;
  summary: string;
  performance: string;
  pacingAndDelivery: string;
  framingAndSetup: string;
  tips: string[];
}

function FeedbackSection({ title, content, delay = 0 }: { title: string; content: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
    >
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5">{title}</p>
      <p className="text-sm text-white/70 leading-relaxed">{content}</p>
    </motion.div>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <div className="h-3 w-24 bg-white/10 rounded mb-3" />
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.15 }}
              className="w-5 h-5 rounded bg-white/10"
            />
          ))}
        </div>
      </div>
      {['Summary', 'Performance & Presence', 'Pacing & Delivery', 'Framing & Setup'].map((label) => (
        <div key={label}>
          <div className="h-3 w-28 bg-white/10 rounded mb-2" />
          <motion.div
            animate={{ opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="space-y-1.5"
          >
            <div className="h-3 w-full bg-white/10 rounded" />
            <div className="h-3 w-4/5 bg-white/10 rounded" />
          </motion.div>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
          <IconSparkles className="w-4 h-4 text-primary/50" />
        </motion.div>
        <p className="text-xs text-white/40">Analyzing your performance...</p>
      </div>
    </div>
  );
}
