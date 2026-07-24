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

/**
 * Logged-out acquisition tease: real activity, names masked server-side (and
 * blurred), no faces. "Join to see who's in the room." Fetches the public feed
 * with anonymize=true — no auth, no React Query dependency (landing has none).
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
    <div className="mx-auto max-w-2xl px-4 text-center">
      <h2 className="font-brand text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Actors are already in here
      </h2>
      {count !== null && (
        <p className="mt-2 text-sm text-muted-foreground">
          {count} {count === 1 ? "actor" : "actors"} working this week.
        </p>
      )}

      <div className="relative mt-8 text-left">
        <ul className="space-y-1">
          {events.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-[#B03000] text-sm font-semibold text-background blur-[2px]">
                {(e.name[0] || "?").toUpperCase()}
              </span>
              <p className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
                <span className="font-medium text-foreground blur-[3px] select-none">
                  {e.name}
                </span>{" "}
                <EventLine e={e as unknown as FeedEvent} />
              </p>
            </motion.li>
          ))}
        </ul>

        {/* scrim fading the lower rows into the CTA */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      <Link
        href="/signup"
        className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_28px_-8px_var(--primary)] transition-colors hover:bg-[#B03000]"
      >
        Join to see who's in the room
      </Link>
    </div>
  );
}
