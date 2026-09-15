"use client";

import { motion } from "framer-motion";
import { useTrending } from "@/hooks/useTrending";
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
    <div>
      {/* The caption sits under its title, not at the far edge of the
          column. `justify-between` threw it across a 560px gap, so the
          two shelves read as four unrelated things instead of two
          headings with subtitles. */}
      <div className="mb-5">
        <h2 className="t-shelf-title">
          Trending <em>this week.</em>
        </h2>
        <p className="t-dir mt-1.5" style={{ fontSize: 12, color: "var(--t-muted-dark-2)" }}>
          (what the house is working on.)
        </p>
      </div>

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.05 } } }}
        className="flex flex-col gap-2.5"
      >
        {/* Ranked. This shelf and "Picked for your type" were the same rows
            in the same card in two identical columns, so the page read as one
            list printed twice. A position numeral is both the distinction and
            the actual meaning of "trending" — the other shelf has no order to
            show, and correctly shows none. */}
        {items.map((m, i) => (
          <motion.div
            key={m.id}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <ShelfCard m={m} rank={i + 1} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}


function TrendingSkeleton() {
  return (
    <div>
      <div className="mb-5 h-8 w-52 animate-pulse rounded bg-muted" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
