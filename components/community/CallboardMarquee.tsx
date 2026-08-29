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
      className="relative flex items-stretch overflow-hidden rounded-full border border-border/50 bg-card/40 backdrop-blur-sm"
    >
      <style>{`
        @keyframes cb-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .cb-track { animation: none !important; } }
      `}</style>

      {/* label — dot always; the word only on wider screens */}
      <div className="z-10 flex shrink-0 items-center gap-2 bg-card/80 py-2.5 pl-4 pr-3 sm:pr-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="hidden font-typewriter text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:inline">
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
            <span key={i} className="block py-2.5 text-sm leading-6 text-muted-foreground">
              <span className="mx-4 align-baseline text-muted-foreground/30">•</span>
              <span className="align-baseline font-medium text-foreground">{e.name}</span>{" "}
              <EventLine e={e} />
            </span>
          ))}
        </div>
      </div>

      {/* trailing — arrow always; the words only on wider screens */}
      <div className="z-10 flex shrink-0 items-center gap-1 bg-card/80 py-2.5 pl-3 pr-4 font-typewriter text-[11px] font-medium text-muted-foreground sm:pl-4">
        <span className="hidden sm:inline">the board</span>
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}
