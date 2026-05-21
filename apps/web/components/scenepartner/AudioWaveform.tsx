"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  /** True while mic is actively recording */
  active: boolean;
  className?: string;
}

const BAR_COUNT = 24;
const IDLE_HEIGHT = 1.5;

export function AudioWaveform({ analyserRef, active, className }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(active);
  activeRef.current = active;

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
    const gap = 1.5;
    const barW = Math.max(1.5, (w - (BAR_COUNT - 1) * gap) / BAR_COUNT);

    let frame = 0;
    let freqData: Uint8Array<ArrayBuffer> | null = null;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;

      const isActive = activeRef.current;
      const analyser = analyserRef.current;

      if (isActive && analyser) {
        if (!freqData || freqData.length !== analyser.frequencyBinCount) {
          freqData = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqData);
      }

      for (let i = 0; i < BAR_COUNT; i++) {
        let barH: number;

        if (isActive && freqData && analyserRef.current) {
          const binIndex = Math.min(
            freqData.length - 1,
            Math.floor(1 + (i / BAR_COUNT) * (freqData.length - 2))
          );
          barH = Math.max(IDLE_HEIGHT, (freqData[binIndex] / 255) * h * 0.7);
        } else if (isActive) {
          const p1 = Math.sin(frame * 0.04 + i * 0.35);
          const p2 = Math.sin(frame * 0.028 + i * 0.5 + 1.5);
          barH = Math.max(IDLE_HEIGHT, (0.15 + 0.35 * Math.abs(p1 * 0.6 + p2 * 0.4)) * h);
        } else {
          barH = IDLE_HEIGHT;
        }

        const x = i * (barW + gap);
        const y = (h - barH) / 2;

        // Brand orange — matches TTSWaveform active color
        ctx.fillStyle = isActive
          ? `rgba(203, 75, 0, ${0.2 + (barH / h) * 0.5})`
          : "rgba(212, 212, 216, 0.2)";

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
      className={cn("rounded", className)}
      style={{ imageRendering: "auto" }}
    />
  );
}
