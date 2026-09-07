"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

/**
 * The house, live, on the landing page.
 *
 * Every other proof on this page is a claim we make about ourselves —
 * testimonials, feature copy, a pricing table. This is the one block a visitor
 * cannot read as marketing, because it is just what happened in the last few
 * hours, whether or not it flatters us. A stranger deciding whether an actor
 * tool is abandoned gets the only answer that settles it.
 *
 * PRIVACY. This calls the feed with `anonymize=true`, which the API has
 * supported all along: names come back as a first initial ("K•••"), headshots
 * are never sent to an unauthenticated visitor, and anyone who turned off
 * "share my activity" is excluded server-side. Raw search text is never in the
 * feed at all — a search appears only as the shape of what was wanted. So the
 * page is honest in both directions: real to the visitor, anonymous to the
 * actors who produced it.
 *
 * Deliberately NOT the app's React Query client: this renders for logged-out
 * visitors, and lib/api attaches a Supabase session. A plain fetch keeps the
 * marketing page free of auth entirely.
 */

type LandingEvent = {
  id: number;
  event_type: string;
  name: string;
  payload: {
    tone?: string;
    gender?: string;
    age_range?: string;
    title?: string;
  };
  created_at: string;
};

function line(e: LandingEvent): string | null {
  const p = e.payload;
  switch (e.event_type) {
    case "searched": {
      /* "looking for woman" was the first version, and it is not a sentence.
         The verb carries the meaning and the attributes are a spec, so they
         are punctuated as one — the same shorthand the signed-in board uses. */
      const bits = [p.tone, p.gender === "female" ? "woman" : p.gender === "male" ? "man" : p.gender, p.age_range]
        .filter(Boolean)
        .join(" · ");
      return bits ? `wants a monologue · ${bits}` : "wants a monologue";
    }
    case "bookmarked":
      return p.title ? `saved ${p.title}` : "saved a monologue";
    case "viewed":
      return p.title ? `reading ${p.title}` : "reading a monologue";
    case "joined":
      return "joined ActorRise";
    case "worked":
      return "ran a monologue out loud";
    case "rehearsing":
    case "rehearsed":
      return "rehearsing a scene";
    default:
      return null;
  }
}

function ago(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function LandingCallboard() {
  const [events, setEvents] = useState<LandingEvent[]>([]);
  const [actorCount, setActorCount] = useState(0);
  const [windowLabel, setWindowLabel] = useState("today");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/community/feed?limit=40&anonymize=true`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setActorCount(data.actor_count ?? 0);
        setWindowLabel(data.window === "today" ? "today" : "this week");
      } catch {
        /* A quiet failure is correct: this is atmosphere on a marketing page,
           and an error state here would be worse than the block's absence. */
      }
    };
    load();
    const id = window.setInterval(load, 45_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  /* Cap arrivals at two.

     Untouched, the window skewed to "joined ActorRise" — five of eight rows on
     the first render — which tells a visitor that people sign up here and
     nothing about whether anyone STAYS. Signups are the least interesting true
     thing we can show a stranger; searching, saving and rehearsing are the
     evidence that the room is working. Capping arrivals lets the rest through
     without inventing anything. */
  const rows: { e: LandingEvent; text: string }[] = [];
  let joins = 0;
  for (const e of events) {
    const text = line(e);
    if (!text) continue;
    if (e.event_type === "joined") {
      if (joins >= 2) continue;
      joins++;
    }
    rows.push({ e, text });
    if (rows.length === 8) break;
  }

  /* Nothing at all rather than an empty frame. A landing page proving the
     product is alive must not ship a section captioned "right now" above six
     blank rows on the one night traffic is thin. */
  if (rows.length < 4) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-5 py-20 sm:py-28">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div>
          <p className="font-typewriter text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            The callboard
          </p>
          <h2 className="mt-2 font-brand text-[clamp(1.75rem,4.5vw,2.75rem)] leading-tight">
            You are not doing this alone
          </h2>
        </div>
        <p className="flex items-center gap-2 font-typewriter text-[13px] text-muted-foreground">
          <span aria-hidden className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          {actorCount} actors {windowLabel}
        </p>
      </div>

      {/* The same ruled call-sheet the signed-in board uses, so a visitor who
          signs up meets something they have already seen. */}
      <ul className="border-t border-border/60">
        {rows.map(({ e, text }) => (
          <li
            key={e.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border/60 py-2.5 font-typewriter text-[13px]"
          >
            <span className="w-16 shrink-0 font-semibold text-foreground/90">{e.name}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{text}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground/60">
              {ago(e.created_at)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 font-typewriter text-xs text-muted-foreground/70">
        First initials only. Actors can keep themselves off the board at any time.{" "}
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          Join them →
        </Link>
      </p>
    </section>
  );
}
