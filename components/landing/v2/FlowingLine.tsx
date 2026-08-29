"use client";

import { useEffect, useRef } from "react";

/**
 * A monologue line flows along a curve through the dark, the ghost light
 * riding the path ahead of it — the product (spoken text) made visible.
 * rAF drives startOffset directly (no React re-renders); the drift distance
 * is modded by one repeat's exact length so the loop is seamless.
 */

const LINE =
  "We need new forms. New forms are needed, and if we can't have them we had better have nothing. — konstantin, the seagull. ✳ ";

const REPEATS = 6;

export function FlowingLine() {
  const textPathRef = useRef<SVGTextPathElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const textPath = textPathRef.current;
    const path = pathRef.current;
    if (!textPath || !path) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const pathLen = path.getTotalLength();
    const textEl = textPath.parentElement as unknown as SVGTextElement | null;
    const repeatLen = textEl ? (textEl as SVGTextElement).getComputedTextLength() / REPEATS : pathLen;

    let raf = 0;
    let start: number | null = null;
    const SPEED = 28; // px per second, an unhurried walking pace

    const tick = (now: number) => {
      if (start === null) start = now;
      const travelled = (((now - start) / 1000) * SPEED) % repeatLen;
      textPath.setAttribute("startOffset", String(-travelled));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div aria-hidden className="relative -my-4 sm:-my-6 select-none" role="presentation">
      <svg
        viewBox="0 0 1440 230"
        className="block w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="flow-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        <path
          ref={pathRef}
          id="flow-path"
          d="M -60 150 C 240 40, 520 210, 780 130 S 1260 60, 1500 140"
          fill="none"
          stroke="var(--stage-line)"
          strokeWidth="0.5"
          opacity="0.5"
        />

        {/* The line, walking the curve */}
        <text
          className="font-typewriter"
          fontSize="15"
          fontStyle="italic"
          letterSpacing="0.08"
          fill="var(--stage-muted)"
        >
          <textPath ref={textPathRef} href="#flow-path" startOffset="0">
            {LINE.repeat(REPEATS)}
          </textPath>
        </text>

        {/* The ghost light, out for a walk ahead of the words */}
        <g>
          <circle r="10" fill="var(--stage-glow)" opacity="0.35" filter="url(#flow-glow)">
            <animateMotion dur="26s" repeatCount="indefinite" rotate="0">
              <mpath href="#flow-path" />
            </animateMotion>
          </circle>
          <circle r="3" fill="var(--stage-glow)">
            <animateMotion dur="26s" repeatCount="indefinite" rotate="0">
              <mpath href="#flow-path" />
            </animateMotion>
          </circle>
        </g>
      </svg>
    </div>
  );
}
