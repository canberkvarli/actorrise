"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { EventLine } from "@/components/community/eventRender";
import type { FeedEvent } from "@/hooks/useCommunityFeed";

interface TeaserEvent {
  id: number;
  event_type: string;
  name: string;
  city?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Each notice hangs at its own slight angle, like a real callboard. */
const TILTS = ["-rotate-[1.1deg]", "rotate-[0.8deg]", "rotate-[1.3deg]", "-rotate-[0.7deg]", "rotate-[0.5deg]", "-rotate-[1.4deg]"];

/**
 * Logged-out acquisition tease styled as the backstage callboard: real
 * activity pinned up as notices, names masked server-side (and blurred),
 * no faces. Fetches the public feed with anonymize=true — no auth, no
 * React Query dependency (landing has none).
 */
export function LandingCallboardTeaser() {
  const [events, setEvents] = useState<TeaserEvent[]>([]);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/community/feed?limit=6&anonymize=true`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setEvents(d.events ?? []);
        setCount(d.actor_count ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 text-center">
      <h2 className="font-brand text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        The callboard
      </h2>
      {count !== null && (
        <p className="stage-direction mt-3 text-sm text-muted-foreground">
          ({count} {count === 1 ? "actor" : "actors"} working this week. these are their notices.)
        </p>
      )}

      <div className="relative mt-10">
        <ul className="grid gap-4 sm:grid-cols-2 text-left">
          {events.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className={`relative rounded-sm border border-border/70 bg-card px-4 pb-4 pt-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.15)] transition-transform duration-300 hover:rotate-0 hover:shadow-[0_6px_18px_-6px_rgba(0,0,0,0.2)] ${TILTS[i % TILTS.length]}`}
            >
              {/* The pin */}
              <span
                aria-hidden
                className="absolute -top-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-primary shadow-[0_2px_3px_rgba(0,0,0,0.35),inset_-1px_-1px_2px_rgba(0,0,0,0.3)]"
              />
              <p className="min-w-0 text-[15px] leading-relaxed text-muted-foreground">
                {/* "joined" lines already carry the city ("…from Seattle") */}
                <span className="font-medium text-foreground">
                  {e.city && e.event_type !== "joined" ? `An actor in ${e.city}` : "An actor"}
                </span>{" "}
                <EventLine e={e as unknown as FeedEvent} />
              </p>
            </motion.li>
          ))}
        </ul>

        {/* scrim fading the lower notices into the CTA */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
      </div>

      <Link
        href="/signup"
        className="mt-8 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_28px_-8px_var(--primary)] transition-colors hover:bg-[#B03000]"
      >
        Join to see who's in the room
      </Link>
    </div>
  );
}
