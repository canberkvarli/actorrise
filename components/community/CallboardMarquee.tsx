"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { EventLine } from "./eventRender";

/**
 * The Callboard as a lit marquee — a slim full-width strip of activity that
 * slides by continuously (pauses on hover). Distinct through motion, tiny
 * footprint, doesn't read as a scripts widget. Mounted atop the landing.
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
    <div className="relative flex items-stretch overflow-hidden rounded-full border border-border/50 bg-card/40 backdrop-blur-sm">
      <style>{`
        @keyframes cb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .cb-track { animation: none !important; } }
      `}</style>

      {/* fixed label */}
      <div className="z-10 flex shrink-0 items-center gap-2 rounded-l-full bg-card/80 px-4 py-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="font-typewriter text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Callboard
        </span>
      </div>

      {/* scrolling track (masked so it fades at both edges) */}
      <div className="group relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]">
        <div
          className="cb-track flex w-max items-center whitespace-nowrap group-hover:[animation-play-state:paused]"
          style={{ animation: "cb-marquee 60s linear infinite" }}
        >
          {run.map((e, i) => (
            <span key={i} className="flex items-center py-2.5 text-sm text-muted-foreground">
              <span className="mx-4 text-muted-foreground/30">•</span>
              <span className="font-medium text-foreground">{e.name}</span>
              <span className="ml-1">
                <EventLine e={e} />
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* board link */}
      <Link
        href="/callboard"
        className="z-10 flex shrink-0 items-center rounded-r-full bg-card/80 px-4 py-2.5 font-typewriter text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        the board →
      </Link>
    </div>
  );
}
