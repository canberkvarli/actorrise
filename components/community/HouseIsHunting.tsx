"use client";

import Link from "next/link";
import { useCallboardPulse, useHouseIsHunting } from "@/hooks/useCallboardPulse";
import { LiveDot } from "@/components/community/Whisper";
import { trackWhisperClicked, trackWhisperShown, type WhisperSurface } from "@/lib/analytics";
import { useEffect, useRef } from "react";

/**
 * What the house is hunting for, on the blank search page.
 *
 * This is the highest-leverage whisper in the app: ~89% of users reach search,
 * and an empty search box is the loneliest screen we own — a blinking cursor
 * that implies you are the only person here.
 *
 * It works because it is two things at once. As social proof it says nine other
 * actors are searching tonight; as an affordance it hands over the eight things
 * they actually searched for, each one a working query. An actor who does not
 * know what to type is given real answers rather than invented "try: dramatic"
 * placeholders, and the answers are true.
 *
 * Renders nothing when the house is quiet. A section reading "the house is
 * hunting for" above an empty row would advertise the silence, which is the
 * exact failure this is meant to fix.
 */
export function HouseIsHunting({
  surface = "search_pre",
  lead,
}: {
  surface?: WhisperSurface;
  /* The empty-results variant leads with the failure instead of the count,
     because there the actor's question is "did I do something wrong?" and the
     honest answer is that the house has not found it either. */
  lead?: string;
} = {}) {
  const { actorCount, window: feedWindow, ready } = useCallboardPulse();
  const tags = useHouseIsHunting(8);

  /* Hooks before the early return, and the impression only counts once the
     line is actually on screen — `ready` gates the render, so firing on mount
     alone would report a whisper nobody saw. */
  const fired = useRef(false);
  const visible = ready && tags.length >= 3;
  useEffect(() => {
    if (!visible || fired.current) return;
    fired.current = true;
    trackWhisperShown(surface, { tag_count: tags.length });
  }, [visible, surface, tags.length]);

  if (!visible) return null;

  /* One line of prose, not a row of chips.

     The first build of this rendered the tags as bordered pills, which put a
     second chip row directly beneath the page's real filter chips — same
     shape, same size, and with "Comedic" and "Dramatic" appearing in BOTH.
     Two controls that look identical and disagree about what they do is worse
     than no social proof at all. A sentence cannot be mistaken for a filter,
     and it also matches what these whispers are supposed to be everywhere
     else: type inside the page's own copy, not another widget. */
  const shown = tags.slice(0, 5);

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      <Link
        href="/callboard"
        onClick={() => trackWhisperClicked(surface, { target: "board" })}
        className="group inline-flex items-center gap-2 transition-colors hover:text-foreground"
      >
        <LiveDot />
        <span>
          {lead ?? `${actorCount} in the house ${feedWindow === "today" ? "today" : "this week"}`}
        </span>
      </Link>
      <span aria-hidden className="text-muted-foreground/40">
        ·
      </span>
      <span className="text-muted-foreground/80">hunting for</span>
      {shown.map(([tag], i) => (
        <span key={tag} className="inline-flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden className="text-muted-foreground/40">
              ·
            </span>
          )}
          <Link
            href={`/monologues?q=${encodeURIComponent(tag)}`}
            onClick={() => trackWhisperClicked(surface, { target: "tag", tag })}
            className="capitalize text-foreground/80 underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {tag}
          </Link>
        </span>
      ))}
    </p>
  );
}
