"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { setScenePartnerAudioCheckDone } from "@/lib/scenepartnerStorage";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { Mic, Volume2, Play, Square, Pause } from "lucide-react";

const SAMPLE_LINE = "I need to tell you something. Will you listen?";

const LEVEL_BAR_COUNT = 12;
const LEVEL_UPDATE_MS = 80;

/** Live level bars from AnalyserNode (green = good, yellow = medium, red = loud) */
function AudioLevelBars({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BAR_COUNT).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevels(Array(LEVEL_BAR_COUNT).fill(0));
      return;
    }
    streamRef.current = stream;
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastUpdate = 0;

    const update = (now: number) => {
      rafRef.current = requestAnimationFrame(update);
      if (now - lastUpdate < LEVEL_UPDATE_MS) return;
      lastUpdate = now;
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      const step = Math.floor(dataArray.length / LEVEL_BAR_COUNT);
      const next = Array.from({ length: LEVEL_BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j] ?? 0;
        return Math.min(100, (sum / step / 128) * 100);
      });
      setLevels(next);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      audioContext.close();
      analyserRef.current = null;
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

/** Level bars from playback audio element (same visual as recording) */
function PlaybackLevelBars({ audioRef, active }: { audioRef: React.RefObject<HTMLAudioElement | null>; active: boolean }) {
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BAR_COUNT).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const el = audioRef.current;

    // Reset levels if not active
    if (!active || !el) {
      setLevels(Array(LEVEL_BAR_COUNT).fill(0));
      return;
    }

    // Create AudioContext and source only if:
    // 1. We don't have a context yet, OR
    // 2. The audio element has changed
    const needsNewConnection = !ctxRef.current || audioElementRef.current !== el;

    if (needsNewConnection) {
      // Clean up previous connection if it exists
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      if (ctxRef.current) {
        ctxRef.current.close();
      }

      // Create new AudioContext and connect
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;

      source.connect(analyser);
      analyser.connect(ctx.destination);

      // Store references
      ctxRef.current = ctx;
      sourceRef.current = source;
      analyserRef.current = analyser;
      audioElementRef.current = el;
    }

    // Start animation loop
    const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
    let lastUpdate = 0;

    const update = (now: number) => {
      rafRef.current = requestAnimationFrame(update);
      if (now - lastUpdate < LEVEL_UPDATE_MS) return;
      lastUpdate = now;
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);
      const step = Math.floor(dataArray.length / LEVEL_BAR_COUNT);
      const next = Array.from({ length: LEVEL_BAR_COUNT }, (_, i) => {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += dataArray[i * step + j] ?? 0;
        return Math.min(100, (sum / step / 128) * 100);
      });
      setLevels(next);
    };

    rafRef.current = requestAnimationFrame(update);

    // Cleanup function for animation loop only
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, audioRef]);

  // Separate effect for final cleanup when component unmounts
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
      if (ctxRef.current) {
        ctxRef.current.close();
      }
    };
  }, []);

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
}

export function ScenePartnerAudioCheck({ onComplete }: ScenePartnerAudioCheckProps) {
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voiceJustChangedRef = useRef(false);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);

  const { speak, cancel, isSpeaking, isSupported: ttsSupported, voices, selectedVoice, setVoice } =
    useSpeechSynthesis({ rate: 1.0, volume: 1.0 });

  // When user changes voice: stop current TTS and play sample with new voice
  useEffect(() => {
    if (!voiceJustChangedRef.current || !selectedVoice) return;
    voiceJustChangedRef.current = false;
    speak(SAMPLE_LINE);
  }, [selectedVoice, speak]);

  const requestMic = useCallback(async () => {
    setRecordError(null);
    setMicPermission("prompt");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch (e) {
      setMicPermission("denied");
      setRecordError("Mic blocked. Allow access in your browser and try again.");
    }
  }, []);

  useEffect(() => {
    if (micPermission === null) {
      requestMic();
    }
  }, [micPermission, requestMic]);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    setRecordedUrl(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setRecordingStream(null);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
      };
      setRecordingStream(stream);
      recorder.start();
      setIsRecording(true);
    } catch (e) {
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
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  // Reset playback state when recorded URL changes (new recording)
  useEffect(() => {
    if (recordedUrl) {
      setIsPlayingRecording(false);
      setPlaybackProgress(0);
    }
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
    const duration = el.duration;
    if (duration > 0 && Number.isFinite(duration)) {
      setPlaybackProgress((el.currentTime / duration) * 100);
    }
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

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Check your audio"
    >
      {/* Backdrop: header and page visible but blurred */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-hidden="true"
      />

      {/* Floating card */}
      <div className="relative w-full max-w-md rounded-3xl border border-border/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden mx-4">
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
            <p className="text-xs text-destructive">{recordError}</p>
          )}
          {micPermission === "granted" && (
            <>
              {!recordedUrl ? (
                <div className="space-y-3">
                  {(isRecording && recordingStream) && (
                    <AudioLevelBars stream={recordingStream} />
                  )}
                  <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                    className="gap-2"
                  >
                    {isRecording ? (
                      <>
                        <Square className="h-3.5 w-3.5" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Mic className="h-3.5 w-3.5" />
                        Record 3 sec
                      </>
                    )}
                  </Button>
                  </div>
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
                  {isPlayingRecording && (
                    <PlaybackLevelBars audioRef={playbackAudioRef} active={isPlayingRecording} />
                  )}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={togglePlayback}
                      className="gap-2 shrink-0"
                    >
                      {isPlayingRecording ? (
                        <>
                          <Pause className="h-3.5 w-3.5" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Play recording
                        </>
                      )}
                    </Button>
                    <div className="flex-1 min-w-0 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-150"
                        style={{ width: `${playbackProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {recordError && !recordedUrl && (
                <p className="text-xs text-destructive">{recordError}</p>
              )}
            </>
          )}
          {micPermission === "denied" && (
            <Button variant="outline" size="sm" onClick={requestMic}>
              Check mic
            </Button>
          )}
        </div>

        {/* TTS */}
        <div className="rounded-2xl border border-border bg-card/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Volume2 className="h-4 w-4" />
            Listen to AI voice
          </div>
          {ttsSupported && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isSpeaking ? cancel() : speak(SAMPLE_LINE))}
                className="gap-2"
              >
                {isSpeaking ? (
                  <>
                    <Square className="h-3.5 w-3.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Play sample
                  </>
                )}
              </Button>
              {voices.length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Voice</label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedVoice?.voiceURI ?? ""}
                    onChange={(e) => {
                      const v = voices.find((x) => x.voiceURI === e.target.value) ?? null;
                      cancel();
                      setVoice(v);
                      voiceJustChangedRef.current = true;
                    }}
                  >
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>

        <Button onClick={handleContinue} className="w-full rounded-full h-11">
          Continue
        </Button>
        </div>
      </div>
    </div>
  );
}
