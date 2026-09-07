"use client";

import { useEffect, useMemo, useState } from "react";
import { useCommunityFeed, type FeedEvent } from "./useCommunityFeed";

/**
 * The Callboard, as texture rather than as a destination.
 *
 * The board itself had exactly one entry point in the whole app (a marquee on
 * /practice), which is the normal fate of a destination page: people do not
 * navigate somewhere to feel less alone, they either feel it where they already
 * are or they do not feel it. So the same live data gets spent as single lines
 * of type on the pages actors already use, and the board becomes the overflow.
 *
 * THE RULE, so this does not become spam: a whisper only appears where it
 * answers a question the actor is already asking. On an empty shelf, "Kylie
 * just saved Lady Bracknell" answers *what goes in here*. On a monologue,
 * "DJAHLISA saved this" answers *is this any good*. On a blank search, the
 * house's live tags answer *what should I try*. Nowhere else — not mid-
 * rehearsal, not on the paywall, not anywhere the actor is concentrating.
 *
 * ONE POLL, NOT SIX. useCommunityFeed keys its React Query cache by `limit`, so
 * a page asking for 8 events and the board asking for 100 are two independent
 * 25s polls. Every whisper in the app goes through this hook on one fixed limit
 * so they all share a single cache entry and a single request.
 */
/* 100, matching what /callboard itself requests.
   Two reasons, and the second is the important one:
   - React Query keys this cache by limit, so using the board's own number means
     the board and every whisper in the app share ONE cache entry and one 25s
     request, rather than the whispers opening a second poll alongside it.
   - At 40 the window only reached a few hours back, so usePieceActivity almost
     never matched: a save from yesterday had already fallen out and the
     monologue-page whisper was silent on essentially every piece. A surface
     that never fires is not restraint, it is dead code. */
const PULSE_LIMIT = 100;

export function useCallboardPulse() {
  const { data } = useCommunityFeed(PULSE_LIMIT);

  /* Every whisper is empty until mounted, and the gate lives here rather than
     in each of them.

     React Query hands a warm cache to the client synchronously, so the server
     rendered a dark nav lamp reading "The Callboard" while the client's first
     pass rendered a lit, pulsing one reading "6 in the house" — a hydration
     mismatch that threw and made React discard and re-render the tree. Any
     component built on live shared data has the same hazard, so one guard on
     the shared hook keeps all of them honest: the server and the client's
     first paint always agree on "nothing yet", and the whisper appears on the
     pass after. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = useMemo(
    () => (mounted ? (data?.events ?? []) : []),
    [data, mounted]
  );

  return {
    events,
    /** How many distinct actors the window covers. */
    actorCount: mounted ? (data?.actor_count ?? 0) : 0,
    window: mounted ? data?.window : undefined,
    ready: mounted && !!data,
  };
}

/** Live search demand, as tags an actor can actually click. Ordered by how many
    people asked for each, so the first tag is genuinely what the house wants. */
export function useHouseIsHunting(max = 8): [string, number][] {
  const { events } = useCallboardPulse();
  return useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (v?: string) => v && counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const e of events) {
      if (e.event_type !== "searched") continue;
      const p = e.payload;
      bump(p.tone);
      bump(p.gender === "female" ? "women" : p.gender === "male" ? "men" : p.gender);
      bump(p.age_range);
      bump(p.emotion);
      (p.themes ?? []).forEach((t) => bump(t));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  }, [events, max]);
}

export type PieceActivity = {
  /** The most recent thing anyone did with this piece. */
  latest: FeedEvent;
  /** How many other actors touched it inside the window. */
  others: number;
};

/**
 * Recent activity on one specific monologue.
 *
 * Deliberately returns an EVENT, not a count. A count ("3 actors read this
 * today") would be a lie here: the pulse only sees the last 40 events, so the
 * number would silently undercount and drift. One concrete fact — who, what,
 * when — is both true and more persuasive than a small integer.
 */
export function usePieceActivity(monologueId?: number | string): PieceActivity | null {
  const { events } = useCallboardPulse();
  return useMemo(() => {
    if (monologueId === undefined || monologueId === null) return null;
    const id = Number(monologueId);
    if (!Number.isFinite(id)) return null;

    const hits = events.filter(
      (e) =>
        e.payload.monologue_id === id &&
        (e.event_type === "viewed" ||
          e.event_type === "bookmarked" ||
          e.event_type === "shared")
    );
    if (hits.length === 0) return null;

    // Named actors first: "DJAHLISA saved this" carries the room in a way that
    // "Someone saved this" cannot, even though both are true.
    const named = hits.find((e) => e.name && e.name !== "Someone");
    const latest = named ?? hits[0];
    const people = new Set(hits.map((e) => e.name || `#${e.id}`));
    return { latest, others: Math.max(0, people.size - 1) };
  }, [events, monologueId]);
}

/** The most recent save by anyone — what an empty shelf is for, demonstrated by
    a real person rather than explained in instructional copy. */
export function useLatestSave(): FeedEvent | null {
  const { events } = useCallboardPulse();
  return useMemo(
    () =>
      events.find(
        (e) =>
          e.event_type === "bookmarked" &&
          !!e.payload.title &&
          !!e.name &&
          e.name !== "Someone"
      ) ?? null,
    [events]
  );
}

/** Is anything happening right now? Drives the nav dot. */
export function useHouseIsAwake(): { awake: boolean; actorCount: number } {
  const { events, actorCount, ready } = useCallboardPulse();
  const awake = useMemo(() => {
    if (!ready) return false;
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return events.some((e) => new Date(e.created_at).getTime() > cutoff);
  }, [events, ready]);
  return { awake, actorCount };
}
