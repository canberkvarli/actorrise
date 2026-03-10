'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { supabase } from '@/lib/supabase';

interface UseWhisperSTTOptions {
  /** Called with final transcript when recording stops and Whisper responds */
  onResult?: (text: string) => void;
  /** Called when recording ends with no usable speech */
  onEnd?: () => void;
  /** Called on mic/transcription error */
  onError?: (msg: string) => void;
  /**
   * Volume level (0–255) below which audio is considered silence.
   * Lower = more sensitive (picks up quieter speech before stopping).
   * Default: 10
   */
  silenceThreshold?: number;
  /**
   * How long continuous silence must last before recording auto-stops.
   * Default: 2500ms
   */
  silenceTimeoutMs?: number;
  /**
   * Expected line text — passed to Whisper as a vocabulary hint for
   * theatrical/dramatic language. Improves accuracy at no extra cost.
   */
  prompt?: string;
  /**
   * External gate ref — silence countdown only starts when this is true.
   * Lets the caller (e.g. SR word matching) control when Whisper should
   * be allowed to transcribe. Without it, falls back to audio-level detection.
   */
  speechGateRef?: React.RefObject<boolean>;
  /** Specific mic device to use (from enumerateDevices). Falls back to default if not set. */
  deviceId?: string;
}

export function useWhisperSTT(options: UseWhisperSTTOptions = {}) {
  const {
    onResult,
    onEnd,
    onError,
    silenceThreshold = 10,
    silenceTimeoutMs = 1500,
    prompt,
    deviceId,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const silenceStartRef = useRef<number | null>(null);
  const stoppedRef = useRef(false); // prevent double-stop
  const mimeTypeRef = useRef<string>('audio/webm');
  const recordingStartRef = useRef<number>(0); // for minimum recording time guard
  const speechDetectedRef = useRef(false); // only start silence timer after speech is detected
  const speechFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // arms silence detection for Bluetooth mics
  const skipNextTranscriptionRef = useRef(false); // set by cancelTranscription to skip the next blob
  const transcribeAbortRef = useRef<AbortController | null>(null); // abort in-flight Whisper request

  // Keep callbacks and options in refs so closures inside RAF loops stay fresh
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  const promptRef = useRef(prompt);
  const deviceIdRef = useRef(deviceId);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);
  useEffect(() => { promptRef.current = prompt; }, [prompt]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (speechFallbackTimerRef.current) {
      clearTimeout(speechFallbackTimerRef.current);
      speechFallbackTimerRef.current = null;
    }
    // Keep AudioContext alive for reuse — closing and recreating it costs ~100ms.
    // It gets closed on unmount or when the stream is released.
    analyserRef.current = null;
  }, []);

  // Fully releases the mic stream. Called on unmount or when deviceId changes.
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    // If the device changes mid-session, release the old stream so the next
    // startRecording acquires the correct mic.
    if (deviceIdRef.current !== deviceId) {
      releaseStream();
    }
    deviceIdRef.current = deviceId;
  }, [deviceId, releaseStream]);

  const stopRecording = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // triggers onstop → transcribe
    }
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob) => {
    // Skip if cancelTranscription() was called (SR already advanced this line)
    if (skipNextTranscriptionRef.current) {
      skipNextTranscriptionRef.current = false;
      setIsTranscribing(false);
      return;
    }

    // Reject obviously-empty recordings (< 500 bytes)
    if (blob.size < 500) {
      setIsTranscribing(false);
      onEndRef.current?.();
      return;
    }

    setIsTranscribing(true);
    const abortController = new AbortController();
    transcribeAbortRef.current = abortController;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Determine file extension from actual MIME type
      const mime = blob.type || mimeTypeRef.current;
      const ext = (mime.includes('mp4') || mime.includes('m4a')) && !mime.includes('webm') ? 'm4a'
        : mime.includes('ogg') ? 'ogg'
        : 'webm';

      const form = new FormData();
      form.append('audio', blob, `recording.${ext}`);

      const currentPrompt = promptRef.current;
      const url = new URL(`${API_URL}/api/speech/transcribe`);
      if (currentPrompt) url.searchParams.set('prompt', currentPrompt.slice(0, 224));

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const text = (data.text ?? '').trim();

      if (text) {
        onResultRef.current?.(text);
      } else {
        onEndRef.current?.();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // silently cancelled — SR already advanced
      onErrorRef.current?.(err?.message ?? 'Transcription failed');
      onEndRef.current?.();
    } finally {
      transcribeAbortRef.current = null;
      setIsTranscribing(false);
    }
  }, []);

  /** Cancel any in-progress or pending Whisper transcription.
   *  Call this when SR already advanced the line so Whisper doesn't block auto-listen. */
  const cancelTranscription = useCallback(() => {
    if (transcribeAbortRef.current) {
      transcribeAbortRef.current.abort();
      transcribeAbortRef.current = null;
    }
    skipNextTranscriptionRef.current = true; // skip the next blob if recorder is still stopping
    setIsTranscribing(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;

    stoppedRef.current = false;
    chunksRef.current = [];
    skipNextTranscriptionRef.current = false; // clear any pending skip from a previous cancelTranscription

    // Reuse existing stream if tracks are still live — avoids getUserMedia latency (~500ms)
    let stream = streamRef.current;
    const tracksLive = stream?.getTracks().every(t => t.readyState === 'live') ?? false;
    if (!tracksLive) {
      releaseStream();
      try {
        const id = deviceIdRef.current;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(id ? { deviceId: { ideal: id } } : {}),
            echoCancellation: true,   // still want this — prevents AI voice feedback
            noiseSuppression: false,  // off: browser VAD clips word onsets (first word issue)
            autoGainControl: true,    // boosts quiet speech
          },
        });
      } catch {
        onErrorRef.current?.('Mic access denied');
        return;
      }
      streamRef.current = stream;
    }

    if (!stream) return;

    // Web Audio pipeline for silence detection.
    // Reuse existing AudioContext if available — creating a new one costs ~100ms.
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    const audioCtx = audioCtxRef.current;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.7;
    source.connect(analyser);
    analyserRef.current = analyser;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    silenceStartRef.current = null;
    // Start as false — silence detection only arms AFTER the user speaks.
    // This prevents auto-stop firing before the user has said anything.
    speechDetectedRef.current = false;
    // Fallback for Bluetooth/AirPods: their mic audio doesn't always register
    // in the Web Audio analyser. After 10s with no detected speech, arm the
    // silence detector anyway so Whisper eventually fires.
    speechFallbackTimerRef.current = setTimeout(() => {
      speechFallbackTimerRef.current = null;
      speechDetectedRef.current = true;
    }, 10000);

    const checkSilence = () => {
      if (stoppedRef.current) return;
      analyser.getByteFrequencyData(freqData);

      const peak = Math.max(...Array.from(freqData));
      if (peak >= silenceThreshold) {
        speechDetectedRef.current = true;
        silenceStartRef.current = null;
      } else if (speechDetectedRef.current) {
        if (silenceStartRef.current === null) silenceStartRef.current = Date.now();
        else if (
          Date.now() - silenceStartRef.current >= silenceTimeoutMs &&
          Date.now() - recordingStartRef.current >= 400
        ) {
          stopRecording();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(checkSilence);
    };

    // Don't start the silence loop until the AudioContext is actually running.
    // When auto-listen fires via useEffect (not a direct tap), browsers suspend
    // the AudioContext — getByteFrequencyData returns all zeros, the silence
    // timer fires immediately, and recording stops before the user speaks.
    const startSilenceLoop = () => {
      if (!stoppedRef.current) rafRef.current = requestAnimationFrame(checkSilence);
    };
    if (audioCtx.state === 'running') {
      startSilenceLoop();
    } else {
      audioCtx.resume().then(startSilenceLoop).catch(startSilenceLoop);
    }

    // Pick best supported MIME type (includes mp4 for Safari)
    const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
      .find(m => !m || MediaRecorder.isTypeSupported(m)) ?? '';

    const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : {});
    // Use browser's actual MIME type (may differ from requested, e.g. Safari uses mp4)
    mimeTypeRef.current = recorder.mimeType || preferredMime || 'audio/webm';
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      setIsRecording(false);
      cleanup();
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      transcribeBlob(blob);
    };

    recorder.start(100); // 100ms chunks
    recordingStartRef.current = Date.now();
    setIsRecording(true);
  }, [isRecording, isTranscribing, silenceThreshold, silenceTimeoutMs, stopRecording, transcribeBlob, cleanup]);

  /** Snapshot current recorded chunks into a Blob (for playback/storage). */
  const getRecordedBlob = useCallback((): Blob | null => {
    if (chunksRef.current.length === 0) return null;
    return new Blob(chunksRef.current, { type: mimeTypeRef.current });
  }, []);

  // Cancel everything on unmount
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(rafRef.current);
      mediaRecorderRef.current?.state !== 'inactive' && mediaRecorderRef.current?.stop();
      cleanup();
      releaseStream();
      // Close AudioContext on unmount (kept alive between recordings, only close here)
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, [cleanup, releaseStream]);

  /** Pre-warm the mic stream AND AudioContext so the first startListening call has no delay. */
  const prewarmStream = useCallback(async () => {
    const tracksLive = streamRef.current?.getTracks().every(t => t.readyState === 'live') ?? false;
    if (!tracksLive) {
      releaseStream();
      try {
        const id = deviceIdRef.current;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(id ? { deviceId: { ideal: id } } : {}),
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
      } catch { /* ignore */ }
    }
    // Pre-create and resume the AudioContext — creating it costs ~100ms on first call.
    // Keeping it alive between recordings avoids that delay on every startRecording.
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [releaseStream]);

  return {
    startListening: startRecording,   // drop-in replacement API
    stopListening: stopRecording,
    cancelTranscription,              // abort pending Whisper so auto-listen isn't blocked
    getRecordedBlob,                  // snapshot audio for playback in session review
    prewarmStream,                    // pre-acquire mic stream before first recording
    isListening: isRecording,
    isTranscribing,
    isSupported: typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined',
    // liveTranscript always empty — Whisper is batch, not real-time
    liveTranscript: '',
    resetTranscript: () => {},
    error: null as string | null,
    // Expose analyser so callers can render a real-time waveform
    analyserRef,
  };
}
