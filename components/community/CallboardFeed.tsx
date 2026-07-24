"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  useCommunityFeed,
  useShareActivity,
  type FeedEvent,
} from "@/hooks/useCommunityFeed";
import { useTrending } from "@/hooks/useTrending";
import { Avatar, EventLine, chipFor, relativeTime } from "./eventRender";

/**
 * The Callboard — not a flat list but the house before curtain: a stat line,
 * what's trending, who just walked in, what everyone's hunting for, then the
 * live feed. All derived client-side from the feed + trending endpoints.
 */
export function CallboardFeed() {
  const { data } = useCommunityFeed(100);
  const { data: trending } = useTrending(6);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const events = useMemo(() => data?.events ?? [], [data]);
  const joined = useMemo(() => events.filter((e) => e.event_type === "joined"), [events]);
  const searched = useMemo(() => events.filter((e) => e.event_type === "searched"), [events]);
  const rehearsed = useMemo(() => events.filter((e) => e.event_type === "rehearsed"), [events]);

  const searchTags = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (v?: string) => v && counts.set(v, (counts.get(v) ?? 0) + 1);
    for (const e of searched) {
      const p = e.payload;
      bump(p.tone);
      bump(p.gender === "female" ? "women" : p.gender === "male" ? "men" : p.gender);
      bump(p.age_range);
      bump(p.emotion);
      (p.themes ?? []).forEach((t) => bump(t));
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [searched]);

  const windowLabel = data?.window === "today" ? "today" : "this week";

  if (!mounted || !data) return <BoardSkeleton />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-8">
        <p className="font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
          (the house, before curtain.)
        </p>
        <h1 className="mt-1 font-brand text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          The Callboard
        </h1>
      </header>

      {/* stat line */}
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={data.actor_count} label={`actors ${windowLabel}`} />
        <Stat n={searched.length} label="searches" />
        <Stat n={rehearsed.length} label="rehearsals" />
        <Stat n={joined.length} label="new faces" />
      </div>

      {/* trending */}
      {trending && trending.length > 0 && (
        <Section title="Trending this week">
          <div className="flex flex-wrap gap-2">
            {trending.map((m) => (
              <Link
                key={m.id}
                href={`/monologue/${m.id}`}
                className="group inline-flex items-baseline gap-1.5 rounded-full border border-border/50 bg-card/40 px-3 py-1.5 transition-colors hover:border-primary/40 hover:bg-primary/[0.05]"
              >
                <span className="font-typewriter text-sm text-foreground group-hover:text-primary">
                  {m.character_name}
                </span>
                <span className="font-typewriter text-xs text-muted-foreground/70">
                  {m.play_title}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* who just joined */}
      {joined.length > 0 && (
        <Section title="New faces">
          <div className="flex flex-wrap gap-4">
            {joined.slice(0, 10).map((e) => (
              <div key={e.id} className="flex flex-col items-center gap-1.5 text-center">
                <Avatar e={e} size={44} />
                <span className="max-w-[64px] truncate text-xs text-muted-foreground">
                  {e.name}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* what everyone's hunting for */}
      {searchTags.length > 0 && (
        <Section title="In the search">
          <div className="flex flex-wrap items-center gap-2">
            {searchTags.map(([tag, count], i) => (
              <span
                key={tag}
                className="bg-card/40 px-2.5 py-1 text-sm capitalize text-muted-foreground"
                style={{ opacity: Math.max(0.55, 1 - i * 0.03), fontSize: count > 2 ? "0.95rem" : undefined }}
              >
                {tag}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* the live feed */}
      <Section title="As it happens">
        <motion.div
          initial="show"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.03 } } }}
        >
          {events.slice(0, 40).map((e) => (
            <FeedRow key={e.id} e={e} />
          ))}
        </motion.div>
      </Section>

      <VisibilityToggle />
    </div>
  );
}

function VisibilityToggle() {
  const { shareActivity, isLoading, setShareActivity } = useShareActivity();
  if (isLoading || shareActivity === undefined) return null;
  return (
    <button
      type="button"
      onClick={() => setShareActivity(!shareActivity)}
      className="text-xs text-muted-foreground/60 underline-offset-2 transition-colors hover:text-foreground hover:underline"
    >
      {shareActivity
        ? "You're visible in here · Hide my activity"
        : "You're hidden · Show my activity"}
    </button>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="border border-border/50 bg-card/30 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-foreground">{n}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 font-typewriter text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FeedRow({ e }: { e: FeedEvent }) {
  const chip = chipFor(e);
  return (
    <motion.div
      variants={{ show: { opacity: 1, y: 0 }, hidden: { opacity: 0, y: 8 } }}
      className="group flex items-center gap-3 border-b border-border/30 py-3"
    >
      <Avatar e={e} size={34} />
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{e.name}</span> <EventLine e={e} />
      </p>
      <span className="shrink-0 text-[11px] text-muted-foreground/50">{relativeTime(e.created_at)}</span>
      {chip && (
        <Link
          href={chip.href}
          className="hidden shrink-0 rounded-full border border-primary/40 px-3 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 group-hover:inline-block"
        >
          {chip.label}
        </Link>
      )}
    </motion.div>
  );
}

function BoardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:pt-12">
      <div className="mb-8 h-12 w-64 animate-pulse rounded bg-muted" />
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse border border-border/40 bg-muted/40" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
