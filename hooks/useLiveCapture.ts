'use client';

/**
 * Everything the rehearsal needs from a microphone, with nothing batch left in it.
 *
 * This replaces `useWhisperSTT`, which was a batch recorder wearing a
 * real-time name. Its own return block admitted as much:
 *
 *     // liveTranscript always empty — Whisper is batch, not real-time
 *     liveTranscript: '',
 *
 * The page compensated by running `webkitSpeechRecognition` alongside it purely
 * to have SOMETHING to highlight with, which gave the rehearsal two
 * recognisers disagreeing about one performance: a browser one that is
 * unavailable on iOS in practice and returns nothing at all on some desktops
 * (`sr_results 0`, `no-speech`, every take), and an authoritative one that
 * could not answer until the actor had already stopped. Neither is kept. There
 * is one source of words now, and when it fails it says so instead of quietly
 * handing over to something worse.
 *
 * Three jobs, deliberately separate:
 *
 *   1. WORDS — `useLiveTranscription`, streaming over WebRTC. The only
 *      transcription in the product's rehearsal path.
 *   2. REVIEW AUDIO — a MediaRecorder, so the actor can play their own takes
 *      back afterwards. This is a feature in its own right, not a second
 *      opinion about what they said: nothing here reads its audio.
 *   3. THE MIC CHECK — an analyser, so the pre-flight screen can show that a
 *      microphone is working before the scene starts.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useLiveTranscription, type LiveStatus } from './useLiveTranscription';

export interface UseLiveCaptureOptions {
  /** What the recording is, in a sentence. Setting, not script. */
  prompt?: string;
  /** Proper nouns for the whole scene — the cast, mostly. */
  keywords?: string[];
  /** Which microphone, when the actor has chosen one. */
  deviceId?: string | null;
}

export interface LiveCapture {
  /* ── Words ──────────────────────────────────────────────────────── */
  status: LiveStatus;
  error: string | null;
  /** The current turn's transcript, growing as the actor speaks. */
  transcript: string;
  /** The transcript has gained no new words for a beat. */
  turnEnded: boolean;
  /** Is the microphone live? */
  listening: boolean;
  /** Open the session. Called once, when the scene loads. */
  open: () => Promise<void>;
  /** The actor's turn begins. */
  beginTurn: (keywords?: string[]) => void;
  /** The actor's turn ends. */
  endTurn: () => void;

  /* ── Review audio ───────────────────────────────────────────────── */
  /** The take just recorded, for playback in the session review. */
  getRecordedBlob: () => Blob | null;

  /* ── The mic check ──────────────────────────────────────────────── */
  analyserRef: React.RefObject<AnalyserNode | null>;
  streamRef: React.RefObject<MediaStream | null>;
  audioCtxRef: React.RefObject<AudioContext | null>;
  prewarmStream: () => Promise<void>;

  isSupported: boolean;
}

export function useLiveCapture(options: UseLiveCaptureOptions = {}): LiveCapture {
  const live = useLiveTranscription({
    prompt: options.prompt,
    keywords: options.keywords,
  });

  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices;

  /**
   * Acquire a microphone for the pre-flight check.
   *
   * A SEPARATE stream from the one the live session streams. Sharing it would
   * mean the meter's analyser and the session's track lived or died together,
   * and the mic check runs before the session exists.
   */
  const prewarmStream = useCallback(async () => {
    if (streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: options.deviceId ? { deviceId: { exact: options.deviceId } } : true,
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
    } catch {
      /* The mic-check screen reads analyserRef and shows its own warning when
         it is null. Nothing here needs to decide what that looks like. */
    }
  }, [options.deviceId]);

  /** Start recording the take, for review playback only. */
  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    if (recorderRef.current?.state === 'recording') return;
    try {
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        lastBlobRef.current = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
          : null;
      };
      rec.start();
      recorderRef.current = rec;
    } catch {
      /* No playback for this take. The rehearsal is unaffected — the words do
         not come from here. */
    }
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec?.state === 'recording') {
      try { rec.stop(); } catch { /* already stopped */ }
    }
  }, []);

  const beginTurn = useCallback((keywords?: string[]) => {
    live.beginTurn(keywords?.length ? { keywords } : undefined);
    startRecording();
  }, [live, startRecording]);

  const endTurn = useCallback(() => {
    live.endTurn();
    stopRecording();
  }, [live, stopRecording]);

  const getRecordedBlob = useCallback(() => lastBlobRef.current, []);

  // Nothing holds a microphone open past the page.
  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch { /* gone */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* gone */ }
    try { void audioCtxRef.current?.close(); } catch { /* gone */ }
  }, []);

  return {
    status: live.status,
    error: live.error,
    transcript: live.transcript,
    turnEnded: live.turnEnded,
    listening: live.listening,
    open: live.open,
    beginTurn,
    endTurn,
    getRecordedBlob,
    analyserRef,
    streamRef,
    audioCtxRef,
    prewarmStream,
    isSupported,
  };
}
