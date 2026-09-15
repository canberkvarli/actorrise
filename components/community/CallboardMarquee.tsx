"use client";

import { useSyncExternalStore } from "react";

/** The canonical hydration guard: false on the server, true once the client
 *  has taken over, with no state to set inside an effect. */
const NEVER_CHANGES = () => () => {};
import Link from "next/link";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { EventLine } from "./eventRender";

/**
 * The Callboard as a lit marquee — a slim full-width strip of activity that
 * slides by continuously (pauses on hover). The whole strip links to the board.
 * On mobile the label/trailing collapse so the ticker itself gets the room.
 */
export function CallboardMarquee() {
  const { data, isLoading } = useCommunityFeed(16);
  const mounted = useSyncExternalStore(NEVER_CHANGES, () => true, () => false);

  const events = data?.events ?? [];

  /* This is the FIRST element on the rehearsal room, and it used to return
     null until its feed arrived — so the entire page rendered, then jumped
     down by the height of this rail the moment the notices landed. After a
     login that is a full document load, which is exactly when it is most
     visible and most annoying.

     It holds its own height while the feed is in flight. Once the answer is
     actually in and the house is quiet, it collapses — that is a real state
     worth showing nothing for, and it happens once, not on every load. */
  if (!mounted || (isLoading && events.length === 0)) {
    return <div aria-hidden className="t-marquee t-marquee--waiting" />;
  }
  if (events.length === 0) return null;

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
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--t-gel)" }} />
        </span>
        <span
          className="hidden sm:inline"
          style={{
            fontFamily: "var(--t-direction)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".2em",
            color: "var(--bar-muted)",
          }}
        >
          callboard
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
            /* Set as an overheard aside rather than a notification row: the
               typewriter face, a little smaller, with the actor's name the one
               thing carrying weight. It read as app chrome in the body sans —
               the same voice the buttons use — which is the wrong register for
               a line about someone else being in the building. */
            <span
              key={i}
              className="block py-2.5 leading-6"
              style={{
                fontFamily: "var(--t-direction)",
                fontSize: 13,
                letterSpacing: "0.02em",
                color: "var(--bar-muted)",
              }}
            >
              <span className="mx-3 align-baseline" style={{ color: "var(--bar-rule)" }}>
                •
              </span>
              <span className="align-baseline font-bold" style={{ color: "var(--bar-fg)" }}>
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
          color: "var(--bar-muted)",
        }}
      >
        <span className="hidden sm:inline">the board</span>
        <span aria-hidden>→</span>
      </div>
    </Link>
  );
}
