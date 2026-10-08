'use client';

/**
 * Everything the rehearsal needs from a microphone, with nothing batch left in it.
 *
 * This replaces `useWhisperSTT` (deleted in this change), which was a batch
 * recorder wearing a real-time name. Its own return block admitted as much:
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
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef('audio/webm');

  const deviceIdRef = useRef(options.deviceId);
  deviceIdRef.current = options.deviceId;

  /**
   * The one microphone, acquired once.
   *
   * Three things read it: the WebRTC track that streams to the transcriber,
   * the MediaRecorder that keeps the take for review, and the analyser behind
   * the mic check. They share it rather than each opening their own.
   */
  const acquire = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceIdRef.current
          ? { deviceId: { exact: deviceIdRef.current } }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      return stream;
    } catch {
      /* The mic-check screen reads analyserRef and shows its own warning when
         it is null, and the session reports its own failure. Nothing here has
         to decide what either looks like. */
      return null;
    }
  }, []);

  const {
    status, error, transcript, turnEnded, listening,
    open,
    beginTurn: liveBeginTurn,
    endTurn: liveEndTurn,
  } = useLiveTranscription({
    prompt: options.prompt,
    keywords: options.keywords,
    getStream: acquire,
  });

  const isSupported =
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices;

  /** Acquire the microphone ahead of the scene, so no line pays for it. */
  const prewarmStream = useCallback(async () => {
    await acquire();
  }, [acquire]);

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
      mimeRef.current = rec.mimeType || 'audio/webm';
      /* A timeslice, because the caller reads the take WHILE it is still
         recording — the delivery handler files the audio for review before it
         mutes the microphone. Without one, MediaRecorder emits a single chunk
         on stop and a read before that returns nothing at all. 250ms keeps the
         unflushed tail inaudible. */
      rec.start(250);
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

  /* Stable identities. These land in the deps of several page callbacks, and
     taking them off the hook's return object instead would give them a new
     identity every render. */
  const beginTurn = useCallback((keywords?: string[]) => {
    liveBeginTurn(keywords?.length ? { keywords } : undefined);
    startRecording();
  }, [liveBeginTurn, startRecording]);

  const endTurn = useCallback(() => {
    liveEndTurn();
    stopRecording();
  }, [liveEndTurn, stopRecording]);

  /** The take so far, for review playback. Safe to call mid-recording. */
  const getRecordedBlob = useCallback(
    () => (chunksRef.current.length
      ? new Blob(chunksRef.current, { type: mimeRef.current })
      : null),
    [],
  );

  // Nothing holds a microphone open past the page.
  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch { /* gone */ }
    try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch { /* gone */ }
    try { void audioCtxRef.current?.close(); } catch { /* gone */ }
  }, []);

  return {
    status,
    error,
    transcript,
    turnEnded,
    listening,
    open,
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
