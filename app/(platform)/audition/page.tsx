'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVideoRecorder } from '@/hooks/useVideoRecorder';
import { useSubscription } from '@/hooks/useSubscription';
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
  const [feedbackUsedThisMonth] = useState(0); // TODO: fetch from API
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState<AuditionFeedback | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [showFeedbackTooltip, setShowFeedbackTooltip] = useState(false);

  // Settings
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [countdownDuration, setCountdownDuration] = useState(3);
  const [showSettings, setShowSettings] = useState(false);

  // Camera preview (separate from recording)
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
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

  // Start camera preview when entering preview/setup state
  const startPreview = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false, // No audio for preview — just visual
      });
      setPreviewStream(mediaStream);
    } catch {
      // Camera not available
    }
  }, []);

  const stopPreview = useCallback(() => {
    if (previewStream) {
      previewStream.getTracks().forEach((t) => t.stop());
      setPreviewStream(null);
    }
  }, [previewStream]);

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

  // Attach recording stream to video element
  useEffect(() => {
    if (videoPreviewRef.current && stream) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Attach recorded video to playback element
  useEffect(() => {
    if (videoPlaybackRef.current && recordedUrl) {
      videoPlaybackRef.current.src = recordedUrl;
    }
  }, [recordedUrl]);

  // Cleanup preview on unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartCountdown = useCallback(() => {
    if (!countdownEnabled) {
      // Skip countdown, go directly to recording
      stopPreview();
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
        stopPreview();
        setPageState('recording');
        startRecording();
      }
    }, 1000);
  }, [countdownEnabled, countdownDuration, startRecording, stopPreview]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    setPageState('recorded');
  }, [stopRecording]);

  const handleReRecord = useCallback(() => {
    clearRecording();
    setFeedback(null);
    setShowFeedback(false);
    setPageState('setup');
    startPreview();
  }, [clearRecording, startPreview]);

  const handleDownload = useCallback(() => {
    if (!recordedBlob || !recordedUrl) return;
    const a = document.createElement('a');
    a.href = recordedUrl;
    a.download = `self-tape-${new Date().toISOString().slice(0, 10)}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [recordedBlob, recordedUrl]);

  const handleGetFeedback = useCallback(async () => {
    if (!recordedBlob) return;
    if (feedbackUsedThisMonth >= feedbackLimit) return;
    setIsAnalyzing(true);
    setShowFeedback(true);

    // TODO: Replace with actual API call
    await new Promise((resolve) => setTimeout(resolve, 3000));

    setFeedback({
      rating: 4,
      lineAccuracy: 'Strong delivery with natural phrasing. No dropped lines detected.',
      pacing: 'Good overall pace. Consider slowing down slightly in the emotional beats around 0:45-1:00 to let the moment land.',
      emotionalTone: 'Genuine vulnerability in the opening. The transition to anger at 1:15 felt authentic. The final beat could use more stillness.',
      framing: 'Good framing — head and shoulders visible with appropriate headroom. Lighting is slightly flat on the left side.',
      tips: [
        'Try a version where you take a longer pause before "I never wanted this"',
        'Your eye line drifts slightly right — lock onto a fixed point just above the camera',
        'The background is clean but consider adding a small practical light for depth',
      ],
    });
    setIsAnalyzing(false);
  }, [recordedBlob, feedbackUsedThisMonth, feedbackLimit]);

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
      {/* Warm key light — top-left, like a Fresnel */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-orange-500/[0.04] blur-[120px]" />
      {/* Cool fill light — top-right */}
      <div className="pointer-events-none absolute -top-24 -right-24 w-[400px] h-[400px] rounded-full bg-blue-400/[0.03] blur-[100px]" />
      {/* Subtle warm spill on floor */}
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -translate-x-1/2 w-[800px] h-[300px] rounded-full bg-amber-500/[0.02] blur-[80px]" />
      {/* Film grain overlay */}
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
            {/* Feedback remaining badge with tooltip */}
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

        <div className="flex flex-col lg:flex-row gap-6">
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
                {/* Setup State — Live camera preview with controls */}
                {pageState === 'setup' && (
                  <motion.div
                    key="setup"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                  >
                    {/* Live camera feed */}
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

                    {/* Settings panel overlay */}
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

                          {/* Countdown toggle */}
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-xs text-white/70">Countdown</label>
                            <button
                              onClick={() => setCountdownEnabled(!countdownEnabled)}
                              className={`w-9 h-5 rounded-full transition-colors relative ${
                                countdownEnabled ? 'bg-primary' : 'bg-white/20'
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                  countdownEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Countdown duration */}
                          {countdownEnabled && (
                            <div className="flex items-center justify-between mb-3">
                              <label className="text-xs text-white/70">Duration</label>
                              <div className="flex items-center gap-1">
                                {[3, 5, 10].map((d) => (
                                  <button
                                    key={d}
                                    onClick={() => setCountdownDuration(d)}
                                    className={`px-2 py-0.5 rounded text-xs transition-colors ${
                                      countdownDuration === d
                                        ? 'bg-primary text-white'
                                        : 'bg-white/10 text-white/50 hover:bg-white/20'
                                    }`}
                                  >
                                    {d}s
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Grid toggle */}
                          <div className="flex items-center justify-between">
                            <label className="text-xs text-white/70">Framing grid</label>
                            <button
                              onClick={() => setShowGrid(!showGrid)}
                              className={`w-9 h-5 rounded-full transition-colors relative ${
                                showGrid ? 'bg-primary' : 'bg-white/20'
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                                  showGrid ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
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
                          {/* Pulsing ring — like a studio tally light */}
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
                    {/* Keep camera visible during countdown */}
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
                    {/* Dark overlay with countdown */}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={countdown}
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 1.5, opacity: 0 }}
                          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                          className="text-8xl lg:text-9xl font-bold text-white/90 tabular-nums"
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
                      ref={videoPreviewRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      style={{ transform: 'scaleX(-1)' }}
                    />

                    {/* Framing Grid */}
                    {showGrid && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="w-full h-full grid grid-cols-3 grid-rows-3">
                          {[...Array(9)].map((_, i) => (
                            <div key={i} className="border border-white/10" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recording Indicator — tally light style */}
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

                    {/* Paused Indicator */}
                    {isPaused && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute top-4 left-1/2 -translate-x-1/2"
                      >
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          PAUSED
                        </Badge>
                      </motion.div>
                    )}

                    {/* Grid Toggle */}
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

            {/* Post-Recording Actions */}
            <AnimatePresence>
              {pageState === 'recorded' && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                  className="mt-4"
                >
                  {/* Primary actions row */}
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/10">
                    {/* Re-record */}
                    <button
                      onClick={handleReRecord}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                    >
                      <IconRefresh className="w-4 h-4" />
                      Re-record
                    </button>

                    <div className="w-px h-6 bg-white/10" />

                    {/* Download */}
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium hover:bg-white/10 transition-colors text-white/50 hover:text-white"
                    >
                      <IconDownload className="w-4 h-4" />
                      Download
                    </button>

                    <div className="w-px h-6 bg-white/10" />

                    {/* AI Feedback — primary CTA */}
                    {feedbackRemaining > 0 ? (
                      duration >= 30 ? (
                        <button
                          onClick={handleGetFeedback}
                          disabled={isAnalyzing}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50"
                        >
                          <IconSparkles className="w-4 h-4" />
                          {isAnalyzing ? 'Analyzing...' : 'Get AI Feedback'}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/25 cursor-not-allowed" title="Record at least 30 seconds to get feedback">
                          <IconSparkles className="w-4 h-4" />
                          Record 30s+ for feedback
                        </span>
                      )
                    ) : (
                      <Link
                        href="/pricing"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium text-primary/70 hover:bg-primary/10 transition-colors"
                      >
                        <IconLock className="w-4 h-4" />
                        Upgrade for feedback
                      </Link>
                    )}

                    {/* Spacer pushes tier actions to the right */}
                    <div className="flex-1" />

                    {/* Save — tier gated */}
                    {canSave ? (
                      <button
                        disabled
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-white/30 cursor-not-allowed"
                      >
                        <IconDeviceFloppy className="w-4 h-4" />
                        <span className="hidden sm:inline">Save</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Soon</Badge>
                      </button>
                    ) : (
                      <Link
                        href="/pricing"
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-xs text-white/20 hover:text-white/40 transition-colors"
                      >
                        <IconLock className="w-3.5 h-3.5" />
                        Save
                      </Link>
                    )}

                    {/* Share — tier gated */}
                    {canShare ? (
                      <button
                        disabled
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm text-white/30 cursor-not-allowed"
                      >
                        <IconShare className="w-4 h-4" />
                        <span className="hidden sm:inline">Share</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Soon</Badge>
                      </button>
                    ) : (
                      <Link
                        href="/pricing"
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-md text-xs text-white/20 hover:text-white/40 transition-colors"
                      >
                        <IconLock className="w-3.5 h-3.5" />
                        Share
                      </Link>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* AI Feedback Panel */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4 }}
                className="w-full lg:w-[380px] shrink-0"
              >
                <div className="border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <IconSparkles className="w-4 h-4 text-primary" />
                      <h3 className="font-semibold text-sm text-white">AI Casting Director</h3>
                    </div>
                  </div>

                  <div className="p-5 space-y-5">
                    {isAnalyzing ? (
                      <FeedbackSkeleton />
                    ) : feedback ? (
                      <>
                        <div>
                          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Overall Rating</p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <IconStarFilled
                                key={star}
                                className={`w-5 h-5 ${star <= feedback.rating ? 'text-primary' : 'text-white/10'}`}
                              />
                            ))}
                            <span className="ml-2 text-sm font-medium text-white">{feedback.rating}/5</span>
                          </div>
                        </div>
                        <FeedbackSection title="Line Accuracy" content={feedback.lineAccuracy} />
                        <FeedbackSection title="Pacing & Timing" content={feedback.pacing} />
                        <FeedbackSection title="Emotional Tone" content={feedback.emotionalTone} />
                        <FeedbackSection title="Framing & Lighting" content={feedback.framing} />
                        <div>
                          <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-2">Try Next Take</p>
                          <ul className="space-y-2">
                            {feedback.tips.map((tip, i) => (
                              <li key={i} className="flex gap-2 text-sm text-white/70">
                                <IconArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02]">
                    <p className="text-xs text-white/30">
                      {feedbackRemaining - (feedback ? 1 : 0)} feedback remaining this month
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tier Upsell */}
        <AnimatePresence>
          {pageState === 'recorded' && userTier === 'free' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="mt-6 border border-primary/20 rounded-lg p-5 bg-primary/[0.05]"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <p className="font-medium text-sm text-white">Want more feedback on your takes?</p>
                  <p className="text-sm text-white/40 mt-1">
                    Upgrade to Solo for 10 AI feedbacks/month, or Plus to save tapes to your library.
                  </p>
                </div>
                <Button asChild size="sm" className="gap-2 shrink-0">
                  <Link href="/pricing">
                    View Plans
                    <IconArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Sub-components ---

interface AuditionFeedback {
  rating: number;
  lineAccuracy: string;
  pacing: string;
  emotionalTone: string;
  framing: string;
  tips: string[];
}

function FeedbackSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5">{title}</p>
      <p className="text-sm text-white/70 leading-relaxed">{content}</p>
    </div>
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
      {['Line Accuracy', 'Pacing & Timing', 'Emotional Tone', 'Framing & Lighting'].map((label) => (
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
