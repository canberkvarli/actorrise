"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useCommunityFeed } from "@/hooks/useCommunityFeed";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";

/**
 * The pre-search "house" — while an actor decides what to search, the results
 * area shows who's in the room right now. On search it hands off to results
 * (the parent AnimatePresence mode="wait" plays this out's exit first).
 *
 * Must be a keyed child of that AnimatePresence; the caller wraps it.
 */
export function CallboardStage({ rows = 6 }: { rows?: number }) {
  const { data } = useCommunityFeed(rows * 3);
  const events = (data?.events ?? []).slice(0, rows);

  // Nothing happening → render nothing (falls back to the old empty state).
  if (events.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl pt-4 pb-10">
      <div className="mb-4 flex items-center justify-between px-1">
        <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
          (the room, right now.)
        </p>
        {data && (
          <span className="text-xs text-muted-foreground/60">
            {data.actor_count} {data.actor_count === 1 ? "actor" : "actors"}{" "}
            {data.window === "today" ? "today" : "this week"}
          </span>
        )}
      </div>

      <motion.ul
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.06 } } }}
        className="space-y-1"
      >
        {events.map((e) => {
          const chip = chipFor(e);
          return (
            <motion.li
              key={e.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-foreground/[0.03]"
            >
              <Avatar e={e} size={36} />
              <p className="min-w-0 flex-1 text-[15px] text-muted-foreground">
                <span className="font-medium text-foreground">{e.name}</span>{" "}
                <EventLine e={e} />
              </p>
              <span className="shrink-0 text-xs text-muted-foreground/50">
                {relativeTime(e.created_at)}
              </span>
              {chip && (
                <Link
                  href={chip.href}
                  className="hidden shrink-0 rounded-full border border-primary/40 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 group-hover:inline-block"
                >
                  {chip.label}
                </Link>
              )}
            </motion.li>
          );
        })}
      </motion.ul>

      <Link
        href="/callboard"
        className="mt-3 block text-center text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        See everything happening →
      </Link>
    </div>
  );
}
