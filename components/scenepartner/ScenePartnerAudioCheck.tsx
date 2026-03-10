"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { setScenePartnerAudioCheckDone } from "@/lib/scenepartnerStorage";
import { useOpenAITTS } from "@/hooks/useOpenAITTS";
import { Mic, Volume2, Play, Square, Pause, X } from "lucide-react";

const SAMPLE_LINE = "I need to tell you something. Will you listen?";

const LEVEL_BAR_COUNT = 12;
const LEVEL_UPDATE_MS = 80;

const AI_VOICES = [
  { id: "coral",   label: "Coral"   },
  { id: "alloy",   label: "Alloy"   },
  { id: "echo",    label: "Echo"    },
  { id: "fable",   label: "Fable"   },
  { id: "nova",    label: "Nova"    },
  { id: "onyx",    label: "Onyx"    },
  { id: "shimmer", label: "Shimmer" },
];

/** Live level bars from AnalyserNode */
function AudioLevelBars({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BAR_COUNT).fill(0));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!stream) {
      setLevels(Array(LEVEL_BAR_COUNT).fill(0));
      return;
    }
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastUpdate = 0;
    const update = (now: number) => {
      rafRef.current = requestAnimationFrame(update);
      if (now - lastUpdate < LEVEL_UPDATE_MS) return;
      lastUpdate = now;
      analyser.getByteFrequencyData(dataArray);
      const step = Math.floor(dataArray.length / LEVEL_BAR_COUNT);
      setLevels(Array.from({ length: LEVEL_BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j] ?? 0;
        return Math.min(100, (sum / step / 128) * 100);
      }));
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioContext.close();
    };
  }, [stream]);

  return (
    <div className="flex items-end justify-center gap-0.5 h-10" aria-hidden="true">
      {levels.map((pct, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full min-h-[4px] transition-all duration-75"
          style={{
            height: `${Math.max(8, pct)}%`,
            backgroundColor: pct < 30 ? "#22c55e" : pct < 70 ? "#eab308" : "#ef4444",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Level bars from playback audio element.
 * AudioContext + source are created ONCE and kept alive — calling
 * createMediaElementSource on the same element twice throws an error.
 */
function PlaybackLevelBars({
  audioRef,
  active,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  active: boolean;
}) {
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BAR_COUNT).fill(0));
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const setupDoneRef = useRef(false);

  // One-time setup: create AudioContext + source when element first mounts.
  // Never recreated — createMediaElementSource may only be called once per element.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || setupDoneRef.current) return;
    setupDoneRef.current = true;

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyser.connect(ctx.destination); // required so audio still plays
    analyserRef.current = analyser;

    return () => {
      setupDoneRef.current = false;
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      analyser.disconnect();
      ctx.close();
      analyserRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Animation loop: starts/stops based on active prop.
  useEffect(() => {
    if (!active || !analyserRef.current) {
      cancelAnimationFrame(rafRef.current);
      setLevels(Array(LEVEL_BAR_COUNT).fill(0));
      return;
    }
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastUpdate = 0;
    const update = (now: number) => {
      rafRef.current = requestAnimationFrame(update);
      if (now - lastUpdate < LEVEL_UPDATE_MS) return;
      lastUpdate = now;
      analyser.getByteFrequencyData(dataArray);
      const step = Math.floor(dataArray.length / LEVEL_BAR_COUNT);
      setLevels(Array.from({ length: LEVEL_BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j] ?? 0;
        return Math.min(100, (sum / step / 128) * 100);
      }));
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  if (!active) return null;
  return (
    <div className="flex items-end justify-center gap-0.5 h-10" aria-hidden="true">
      {levels.map((pct, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full min-h-[4px] transition-all duration-75"
          style={{
            height: `${Math.max(8, pct)}%`,
            backgroundColor: pct < 30 ? "#22c55e" : pct < 70 ? "#eab308" : "#ef4444",
          }}
        />
      ))}
    </div>
  );
}

interface ScenePartnerAudioCheckProps {
  onComplete: () => void;
  /** If true, shows an X button to dismiss without marking done (re-check flow). */
  dismissible?: boolean;
  onDismiss?: () => void;
}

export function ScenePartnerAudioCheck({ onComplete, dismissible, onDismiss }: ScenePartnerAudioCheckProps) {
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState("coral");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const { speak, cancel, isSpeaking, isLoading: isTTSLoading } = useOpenAITTS({});

  const requestMic = useCallback(async () => {
    setRecordError(null);
    setMicPermission("prompt");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
      setRecordError("Mic blocked. Allow access in your browser and try again.");
    }
  }, []);

  useEffect(() => {
    if (micPermission === null) requestMic();
  }, [micPermission, requestMic]);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    setRecordedUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
        .find(m => !m || MediaRecorder.isTypeSupported(m)) ?? '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      const actualMime = recorder.mimeType || mime || 'audio/webm';
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        setRecordingStream(null);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setRecordedUrl(URL.createObjectURL(blob));
      };
      setRecordingStream(stream);
      recorder.start(100);
      setIsRecording(true);
    } catch {
      setRecordError("Could not start recording.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  useEffect(() => {
    return () => { if (recordedUrl) URL.revokeObjectURL(recordedUrl); };
  }, [recordedUrl]);

  useEffect(() => {
    if (recordedUrl) { setIsPlayingRecording(false); setPlaybackProgress(0); }
  }, [recordedUrl]);

  const togglePlayback = useCallback(() => {
    const el = playbackAudioRef.current;
    if (!el || !recordedUrl) return;
    if (isPlayingRecording) {
      el.pause();
      setIsPlayingRecording(false);
    } else {
      el.play().catch(() => {});
      setIsPlayingRecording(true);
    }
  }, [recordedUrl, isPlayingRecording]);

  const handlePlaybackTimeUpdate = useCallback(() => {
    const el = playbackAudioRef.current;
    if (!el) return;
    const d = el.duration;
    if (d > 0 && Number.isFinite(d)) setPlaybackProgress((el.currentTime / d) * 100);
  }, []);

  const handlePlaybackEnded = useCallback(() => {
    setIsPlayingRecording(false);
    setPlaybackProgress(0);
  }, []);

  const handleContinue = useCallback(() => {
    cancel();
    setScenePartnerAudioCheckDone();
    onComplete();
  }, [cancel, onComplete]);

  const handleVoicePreview = useCallback(() => {
    if (isSpeaking || isTTSLoading) {
      cancel();
    } else {
      speak(SAMPLE_LINE, selectedVoiceId, "Deliver this line with quiet, genuine urgency.");
    }
  }, [isSpeaking, isTTSLoading, cancel, speak, selectedVoiceId]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Check your audio"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" aria-hidden="true" />

      <div className="relative w-full max-w-md rounded-3xl border border-border/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden mx-4">
        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="p-6 sm:p-8 space-y-8">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-1">Check your audio</h2>
            <p className="text-sm text-muted-foreground">Test mic and AI voice so rehearsal runs smoothly.</p>
          </div>

          {/* Mic */}
          <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Mic className="h-4 w-4" />
              Test your mic
            </div>
            {micPermission === "denied" && (
              <>
                <p className="text-xs text-destructive">{recordError}</p>
                <Button variant="outline" size="sm" onClick={requestMic}>Check mic</Button>
              </>
            )}
            {micPermission === "granted" && (
              <>
                {!recordedUrl ? (
                  <div className="space-y-3">
                    {isRecording && recordingStream && <AudioLevelBars stream={recordingStream} />}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={isRecording ? stopRecording : startRecording}
                      className="gap-2"
                    >
                      {isRecording ? <><Square className="h-3.5 w-3.5" />Stop</> : <><Mic className="h-3.5 w-3.5" />Record 3 sec</>}
                    </Button>
                    {recordError && <p className="text-xs text-destructive">{recordError}</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <audio
                      ref={playbackAudioRef}
                      src={recordedUrl}
                      className="sr-only"
                      onTimeUpdate={handlePlaybackTimeUpdate}
                      onEnded={handlePlaybackEnded}
                      onLoadedMetadata={handlePlaybackTimeUpdate}
                    />
                    <PlaybackLevelBars audioRef={playbackAudioRef} active={isPlayingRecording} />
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={togglePlayback} className="gap-2 shrink-0">
                        {isPlayingRecording ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Play recording</>}
                      </Button>
                      <div className="flex-1 min-w-0 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-150"
                          style={{ width: `${playbackProgress}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={startRecording}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        Re-record
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* AI Voice */}
          <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Volume2 className="h-4 w-4" />
              Listen to AI voice
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Voice</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedVoiceId}
                onChange={(e) => {
                  setSelectedVoiceId(e.target.value);
                  cancel();
                }}
              >
                {AI_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleVoicePreview}
              disabled={isTTSLoading}
              className="gap-2"
            >
              {isTTSLoading ? (
                <><div className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />Loading...</>
              ) : isSpeaking ? (
                <><Square className="h-3.5 w-3.5" />Stop</>
              ) : (
                <><Play className="h-3.5 w-3.5" />Play sample</>
              )}
            </Button>
          </div>

          <Button onClick={handleContinue} className="w-full rounded-full h-11">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
