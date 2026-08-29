"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconSparkles } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";

/**
 * Pre-search "Picked for your type" shelf on /monologues.
 *
 * The profile-based recommender already exists, but it was hidden behind the
 * "Find for me" button — so a user who searched once and left never felt the
 * personalization, and never had a reason to finish their profile. Profile-havers
 * rehearse ~1.6x more, so we surface the recommender BY DEFAULT and label it, and
 * when there is no profile yet the same slot recruits one. Self-contained like
 * TrendingPreSearch (navigates via Link, fetches its own data).
 */
export function ForYouShelf() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["for-you-shelf"],
    queryFn: async () => {
      const res = await api.get<Monologue[]>(
        "/api/monologues/recommendations?limit=6&fast=true",
      );
      return res.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // The recommender 400s when there is no profile yet. Turn the slot into a
  // one-line nudge so the empty state itself recruits the 54% who never fill it.
  const noProfile =
    isError &&
    /profile|complete your profile|actor profile not found/i.test(
      (error as Error)?.message ?? "",
    );
  if (noProfile) return <ProfileNudge />;

  if (isLoading) return <ForYouSkeleton />;
  const items = data ?? [];
  if (isError || items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl pt-2 pb-8">
      <div className="mb-4 flex items-center gap-2 px-1">
        <IconSparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Picked for your type
        </h2>
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((m) => (
          <motion.div
            key={m.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <ForYouCard m={m} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

function ForYouCard({ m }: { m: Monologue }) {
  const mins = Math.round((m.estimated_duration_seconds || 0) / 60);
  const meta = [m.character_age_range, m.tone, mins ? `${mins} min` : null].filter(
    Boolean,
  );

  return (
    <Link
      href={`/monologue/${m.id}`}
      className="group flex h-full flex-col rounded-xl border border-border/50 bg-card/40 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_0_24px_-12px_var(--primary)]"
    >
      <h3 className="font-typewriter text-base font-semibold leading-snug text-foreground line-clamp-1">
        {m.character_name}
      </h3>
      <p className="font-typewriter text-xs text-muted-foreground line-clamp-1">
        {m.play_title}
      </p>
      {meta.length > 0 && (
        <p className="mt-auto pt-3 text-xs text-muted-foreground/70">
          {meta.join(" · ")}
        </p>
      )}
    </Link>
  );
}

function ProfileNudge() {
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-8">
      <Link
        href="/profile"
        className="group flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 transition-all hover:border-primary/50"
      >
        <div className="flex items-start gap-2.5">
          <IconSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Add your type, get monologues picked for you
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Age range, gender, experience. Takes a minute, and every search
              gets tailored to you.
            </p>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-primary">Add it →</span>
      </Link>
    </div>
  );
}

function ForYouSkeleton() {
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-8">
      <div className="mb-4 h-4 w-44 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
