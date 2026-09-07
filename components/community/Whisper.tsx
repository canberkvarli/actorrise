"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { relativeTime } from "./eventRender";
import {
  trackWhisperClicked,
  trackWhisperShown,
  type WhisperSurface,
} from "@/lib/analytics";
import type { FeedEvent } from "@/hooks/useCommunityFeed";

/**
 * A whisper: one line of type saying that other actors are here.
 *
 * The Callboard's whole value is that a solo actor searching alone at 11pm can
 * see that nine other people are doing the same thing tonight. That is a
 * feeling, and feelings do not survive being put behind a nav item — so the
 * board's data gets spent as single lines on the pages actors already use.
 *
 * These are deliberately NOT cards. A card is a thing you look at; a line of
 * type inside the page's own copy is a thing you absorb without stopping. If a
 * whisper ever needs a border to earn its place, it is on the wrong page.
 *
 * MEASUREMENT IS BUILT IN, not bolted on per surface. Every whisper reports an
 * impression when it mounts and a click when it is followed, tagged with its
 * surface. These all shipped on a design argument with no evidence behind it,
 * and "does anyone act on this?" cannot be answered by looking at the page.
 * The expected outcome is that some surfaces earn their place and some get
 * deleted; wiring the events into the shared component is what makes that
 * decision possible without revisiting six files.
 */

/** Fire an impression once per mount, never per render — the pulse refetches
    every 25s and re-rendering is not seeing. */
function useImpression(surface: WhisperSurface, extra?: Record<string, unknown>) {
  const fired = useRef(false);
  // Held in a ref so a caller passing an inline object literal (the normal
  // case) does not re-fire the effect on every render.
  const payload = useRef(extra);
  payload.current = extra;

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackWhisperShown(surface, payload.current);
  }, [surface]);
}

/** The one shared visual: a small live dot. Green means the room is occupied,
    which is the only claim any of these lines is making. */
export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span className={`relative flex h-1.5 w-1.5 shrink-0 ${className}`} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
    </span>
  );
}

/** The base line. Always links to the board — a whisper that cannot be followed
    up is a dead end, and the board is the natural overflow for all of them. */
export function Whisper({
  children,
  className = "",
  href = "/callboard",
  tone = "default",
  surface,
  meta,
}: {
  children: React.ReactNode;
  className?: string;
  href?: string;
  /* "dark" is for whispers laid over a poster or any image-backed hero, where
     the app's muted-foreground token has no contrast to work with. */
  tone?: "default" | "dark";
  surface: WhisperSurface;
  meta?: Record<string, unknown>;
}) {
  useImpression(surface, meta);

  return (
    <Link
      href={href}
      onClick={() => trackWhisperClicked(surface, meta)}
      className={`group inline-flex max-w-full items-center gap-2 text-sm transition-colors ${
        tone === "dark"
          ? "text-white/75 hover:text-white"
          : "text-muted-foreground hover:text-foreground"
      } ${className}`}
    >
      <LiveDot />
      <span className="min-w-0 truncate">{children}</span>
      <span
        aria-hidden
        className="shrink-0 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
      >
        →
      </span>
    </Link>
  );
}

/** "DJAHLISA saved this · 19h ago" — for a specific piece.

    A concrete fact, not a count. The pulse only sees a window of recent events,
    so any number here would quietly undercount; who-and-when is both true and
    more persuasive than a small integer. */
export function PieceWhisper({
  latest,
  others,
  tone = "default",
  surface = "monologue",
}: {
  latest: FeedEvent;
  others: number;
  tone?: "default" | "dark";
  surface?: WhisperSurface;
}) {
  const verb =
    latest.event_type === "bookmarked"
      ? "saved this"
      : latest.event_type === "shared"
        ? "shared this"
        : "read this";
  const strong = tone === "dark" ? "text-white" : "text-foreground/90";
  const faint = tone === "dark" ? "text-white/55" : "text-muted-foreground/70";
  return (
    <Whisper tone={tone} surface={surface} meta={{ event_type: latest.event_type, others }}>
      <span className={`font-medium ${strong}`}>{latest.name}</span> {verb}
      <span className={faint}> · {relativeTime(latest.created_at)}</span>
      {others > 0 && (
        <span className={faint}>
          {" "}
          · {others} other{others === 1 ? "" : "s"} too
        </span>
      )}
    </Whisper>
  );
}
