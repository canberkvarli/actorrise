"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { IconFlame } from "@tabler/icons-react";
import { useTrending } from "@/hooks/useTrending";
import type { Monologue } from "@/types/actor";
import { ShelfCard } from "@/components/monologue/ShelfCard";

/**
 * Pre-search filler for /monologues that actually helps: the pieces other
 * actors are working on right now. Task-serving (start a search from here) with
 * light social proof, replacing the raw activity feed that lived here before.
 */
export function TrendingPreSearch() {
  const { data, isLoading } = useTrending(6);

  if (isLoading) return <TrendingSkeleton />;
  // Array.isArray, not ?? : this shelf sits on the app's busiest page, and a
  // non-array payload (stale persisted cache, an error body) reaching .map
  // throws inside render and blanks the whole route.
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) return null;

  return (
    <div className="mx-auto max-w-4xl pt-2 pb-10">
      <div className="mb-4 flex items-center gap-2 px-1">
        <IconFlame className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Trending this week
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
            <ShelfCard m={m} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}


function TrendingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl pt-2 pb-10">
      <div className="mb-4 h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
