"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface MicWaveformProps {
  /** Whether mic is actively listening */
  active: boolean;
  className?: string;
}

const BAR_COUNT = 20;

// ── Module-level mic pipeline ──────────────────────────────────────────
// Cached across mounts so the analyser is ready instantly when `active` flips.
let _stream: MediaStream | null = null;
let _audioCtx: AudioContext | null = null;
let _analyser: AnalyserNode | null = null;
let _freqData: Uint8Array<ArrayBuffer> | null = null;
let _initPromise: Promise<void> | null = null;

/** Warm up the mic pipeline once. Subsequent calls are no-ops. */
export function warmUpMic(): void {
  if (_initPromise) return;
  _initPromise = (async () => {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _audioCtx = new AudioContext();
      const source = _audioCtx.createMediaStreamSource(_stream);
      _analyser = _audioCtx.createAnalyser();
      _analyser.fftSize = 128;
      _analyser.smoothingTimeConstant = 0.6;
      source.connect(_analyser);
      _freqData = new Uint8Array(_analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      // Mic unavailable — waveform will just show idle animation
    }
  })();
}

export function MicWaveform({ active, className }: MicWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  // Init mic pipeline only when we actually need it (active=true).
  // Avoids racing getUserMedia against SpeechRecognition on mount.
  useEffect(() => {
    if (!active) return;
    warmUpMic();
    if (_audioCtx?.state === "suspended") {
      _audioCtx.resume();
    }
  }, [active]);

  // Animation loop — always runs when mounted
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
    const gap = 2.5;
    const barW = Math.max(2, (w - (BAR_COUNT - 1) * gap) / BAR_COUNT);

    let frame = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;

      const isActive = activeRef.current;
      const hasRealData = isActive && _analyser && _freqData;

      if (hasRealData) {
        _analyser!.getByteFrequencyData(_freqData!);
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        let barH: number;

        if (hasRealData && _freqData) {
          const binIndex = Math.min(
            _freqData.length - 1,
            Math.floor(1 + (i / BAR_COUNT) * (_freqData.length - 2))
          );
          barH = Math.max(1.5, (_freqData[binIndex] / 255) * h * 0.85);
        } else if (isActive) {
          // Gentle pulse while waiting for mic data
          const speed = 0.04;
          const p = Math.sin(frame * speed + i * 0.4);
          barH = Math.max(1.5, (0.08 + 0.15 * Math.abs(p)) * h);
        } else {
          // Idle: very subtle tiny bars
          const speed = 0.015;
          const p = Math.sin(frame * speed + i * 0.3);
          barH = Math.max(1, (0.04 + 0.04 * Math.abs(p)) * h);
        }

        const x = i * (barW + gap);
        const y = (h - barH) / 2;
        const opacity = isActive
          ? 0.25 + (barH / h) * 0.65
          : 0.1 + (barH / h) * 0.15;
        ctx.fillStyle = `rgba(203, 75, 0, ${opacity})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("w-full h-5 rounded", className)}
      style={{ imageRendering: "auto" }}
    />
  );
}
