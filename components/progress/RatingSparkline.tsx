"use client";

import type { RatingTrendPoint } from "@/hooks/useRehearseStats";

/**
 * A tiny dependency-free SVG sparkline of rehearsal ratings (0–5).
 * Renders nothing when there are fewer than two points.
 */
export function RatingSparkline({
  points,
  className,
}: {
  points: RatingTrendPoint[];
  className?: string;
}) {
  if (!points || points.length < 2) return null;

  const width = 160;
  const height = 40;
  const pad = 4;
  const max = 5;

  const xs = points.map(
    (_, i) => pad + (i * (width - pad * 2)) / (points.length - 1),
  );
  const ys = points.map(
    (p) => height - pad - (Math.max(0, Math.min(max, p.rating)) / max) * (height - pad * 2),
  );

  const line = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Rating trend over recent sessions"
    >
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
      <circle cx={lastX} cy={lastY} r={2.5} className="fill-primary" />
    </svg>
  );
}
