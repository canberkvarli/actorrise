"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TTSWaveformProps {
  /** The HTMLAudioElement currently playing (null when idle). */
  audioElement: HTMLAudioElement | null;
  /** Whether TTS is currently loading (fetching audio). */
  isLoading: boolean;
  /** Whether TTS is currently speaking. */
  isSpeaking: boolean;
  /** Called on each animation frame with progress 0..1 */
  onProgress?: (progress: number) => void;
  /** Optional className for the outer wrapper. */
  className?: string;
}

const BAR_COUNT = 40;
const IDLE_HEIGHT = 2; // px
const ONSET_THRESHOLD = 12; // avg frequency amplitude to consider "speech started"

// Shared AudioContext + per-element source cache (one source per element lifetime)
let _audioCtx: AudioContext | null = null;
const _sourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

function getAudioContext(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function getOrCreateSource(el: HTMLAudioElement): MediaElementAudioSourceNode {
  const existing = _sourceMap.get(el);
  if (existing) return existing;
  const ctx = getAudioContext();
  const src = ctx.createMediaElementSource(el);
  // Connect through to destination so audio still plays through speakers
  src.connect(ctx.destination);
  _sourceMap.set(el, src);
  return src;
}

/**
 * Animated waveform visualizer for TTS playback.
 *
 * Uses Web Audio API AnalyserNode for real frequency data.
 * Detects actual speech onset from amplitude to report accurate progress.
 */
export function TTSWaveform({
  audioElement,
  isLoading,
  isSpeaking,
  onProgress,
  className,
}: TTSWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Speech onset/offset detection
  const onsetTimeRef = useRef<number>(-1);
  const lastVoicedTimeRef = useRef<number>(0);

  // Set up analyser when audio element changes
  useEffect(() => {
    // Reset onset detection for new audio
    onsetTimeRef.current = -1;
    lastVoicedTimeRef.current = 0;

    if (!audioElement || !isSpeaking) {
      analyserRef.current = null;
      dataRef.current = null;
      return;
    }
    try {
      const ctx = getAudioContext();
      const source = getOrCreateSource(audioElement);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      return () => {
        try { source.disconnect(analyser); } catch { /* already disconnected */ }
        analyserRef.current = null;
        dataRef.current = null;
      };
    } catch {
      analyserRef.current = null;
      dataRef.current = null;
    }
  }, [audioElement, isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barW = Math.max(2, (w - (BAR_COUNT - 1) * 1.5) / BAR_COUNT);
    const gap = 1.5;

    let frame = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;

      const analyser = analyserRef.current;
      const freqData = dataRef.current;
      const hasRealData = analyser && freqData && isSpeaking;

      let avgAmplitude = 0;

      if (hasRealData) {
        analyser.getByteFrequencyData(freqData);
        // Compute average amplitude across voice-range bins
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        avgAmplitude = sum / freqData.length;

        // Detect speech onset: first frame with meaningful amplitude
        if (audioElement && onsetTimeRef.current < 0 && avgAmplitude > ONSET_THRESHOLD) {
          onsetTimeRef.current = audioElement.currentTime;
        }
        // Track last voiced time for trail estimation
        if (audioElement && avgAmplitude > ONSET_THRESHOLD) {
          lastVoicedTimeRef.current = audioElement.currentTime;
        }
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        let barH: number;

        if (hasRealData && freqData) {
          const binIndex = Math.min(
            freqData.length - 1,
            Math.floor(1 + (i / BAR_COUNT) * (freqData.length - 2))
          );
          const value = freqData[binIndex] / 255;
          barH = Math.max(IDLE_HEIGHT, value * h * 0.85);
        } else if (isSpeaking || isLoading) {
          const speed = isSpeaking ? 0.06 : 0.03;
          const amplitude = isSpeaking ? 0.55 : 0.25;
          const p1 = Math.sin(frame * speed + i * 0.35);
          const p2 = Math.sin(frame * speed * 0.7 + i * 0.5 + 1.5);
          const combined = p1 * 0.6 + p2 * 0.4;
          barH = Math.max(IDLE_HEIGHT, (0.25 + amplitude * Math.abs(combined)) * h);
        } else {
          barH = IDLE_HEIGHT;
        }

        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        ctx.fillStyle = isSpeaking
          ? `rgba(234, 88, 12, ${0.4 + (barH / h) * 0.6})`
          : isLoading
          ? "rgba(156, 163, 175, 0.4)"
          : "rgba(212, 212, 216, 0.3)";

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }

      // Report speech-onset-aware progress
      if (audioElement && audioElement.duration && isSpeaking && onProgress) {
        if (onsetTimeRef.current >= 0) {
          // Speech has started — compute progress relative to actual speech region
          const onset = onsetTimeRef.current;
          // Estimate trail: mirror onset duration, cap at 0.15s
          const trail = Math.min(onset * 0.8, 0.15);
          const speechDuration = Math.max(0.1, audioElement.duration - onset - trail);
          const elapsed = audioElement.currentTime - onset;
          onProgress(Math.max(0, Math.min(1, elapsed / speechDuration)));
        } else {
          // Still in lead-in silence — report 0
          onProgress(0);
        }
      } else if (audioElement && audioElement.duration && isSpeaking && onProgress) {
        // Fallback without analyser: raw progress
        onProgress(audioElement.currentTime / audioElement.duration);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioElement, isSpeaking, isLoading, onProgress]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-10 rounded", className)}
      style={{ imageRendering: "auto" }}
    />
  );
}
