"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { EventLine } from "./eventRender";

/**
 * The Callboard as a lit marquee — a slim full-width strip of activity that
 * slides by continuously (pauses on hover). The whole strip links to the board.
 * On mobile the label/trailing collapse so the ticker itself gets the room.
 */
export function CallboardMarquee() {
  const { data } = useCommunityFeed(16);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = data?.events ?? [];
  if (!mounted || events.length === 0) return null;

  // Duplicate the run so the loop is seamless (translateX -50% == one full set).
  const run = [...events, ...events];

  return (
    <Link
      href="/callboard"
      className="t-marquee relative flex items-stretch overflow-hidden"
    >
      <style>{`
        @keyframes cb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .cb-track { animation: none !important; } }
      `}</style>

      {/* label — dot always; the word only on wider screens */}
      <div className="t-marquee__cap z-10 flex shrink-0 items-center gap-2.5 py-2.5 pl-[18px] pr-3.5 sm:pr-4">
        <span className="relative flex h-2 w-2">
          <span className="t-marquee__pulse absolute inline-flex h-full w-full rounded-full" />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--t-orange)" }} />
        </span>
        <span
          className="hidden sm:inline"
          style={{
            fontFamily: "var(--t-direction)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--t-muted-light-2)",
          }}
        >
          Callboard
        </span>
      </div>

      {/* scrolling track (masked so it fades at both edges) */}
      <div className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className="cb-track flex w-max items-center whitespace-nowrap group-hover:[animation-play-state:paused]"
          style={{ animation: "cb-marquee 60s linear infinite" }}
        >
          {/* One inline flow per notice, not flex children — the typewriter
              titles inside EventLine have different metrics than the sans, and
              as separate flex items each got centered on its own line box, so
              words like "saved" rode above the rest. */}
          {run.map((e, i) => (
            <span
              key={i}
              className="block py-2.5 text-sm leading-6"
              style={{ color: "var(--t-muted-light-2)" }}
            >
              <span className="mx-3 align-baseline" style={{ color: "oklch(0.40 0.03 55)" }}>
                •
              </span>
              <span className="align-baseline font-bold" style={{ color: "var(--t-cream)" }}>
                {e.name}
              </span>{" "}
              <EventLine e={e} />
            </span>
          ))}
        </div>
      </div>

      {/* trailing — arrow always; the words only on wider screens */}
      <div
        className="t-marquee__cap z-10 flex shrink-0 items-center gap-1.5 py-2.5 pl-3.5 pr-[18px] sm:pl-4"
        style={{
          fontFamily: "var(--t-direction)",
          fontSize: 11,
          letterSpacing: ".06em",
          color: "var(--t-muted-light-2)",
        }}
      >
        <span className="hidden sm:inline">the board</span>
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}
