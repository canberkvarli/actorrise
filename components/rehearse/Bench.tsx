"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { IconBulb, IconBulbFilled, IconX } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { InstantTooltip } from "@/components/ui/instant-tooltip";
import { PlayCover } from "@/components/monologue/PlayCover";
import { posterAt } from "@/lib/poster";
import {
  benchState,
  formatDuration,
  lastWorkedLabel,
  leadName,
  sourceLabel,
  sourceLine,
  titleCase,
} from "@/lib/collectionMeta";
import type { Monologue } from "@/types/actor";

/**
 * The piece you are working on, at working size.
 *
 * The screen this replaces was an inventory: a title, a four-segment filter
 * bar and a list. That shape answers "which one?", and with a median
 * collection of two pieces — 46% of actors hold exactly one — nobody is
 * asking it. They are looking at one piece and want to know what to do with
 * it now, which is what this says, once, in the largest thing on the page.
 *
 * It is also the first surface in the collection where the monologue is
 * actually present. The list showed titles, so you could stand on the page
 * that exists to make you rehearse without meeting a single line of writing.
 */
export function Bench({
  monologue,
  onToggleMemorized,
  onRemove,
}: {
  monologue: Monologue;
  onToggleMemorized: () => void;
  onRemove: () => void;
}) {
  const state = benchState(monologue);
  const memorized = Boolean(monologue.memorized);
  const poster = posterAt(monologue.poster_url, 600);
  const lead = leadName(monologue);
  const source = sourceLine(monologue);

  const facts = [
    formatDuration(monologue.estimated_duration_seconds),
    sourceLabel(monologue.source_type),
    titleCase(monologue.tone),
    lastWorkedLabel(monologue.last_studied_at),
  ].filter((f): f is string => Boolean(f));

  const excerpt = monologue.text?.replace(/\s+/g, " ").trim() ?? "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      /* `dark stage-scene` is the app's own lit surface — the same move the
         landing makes between acts. The bench is lit and the shelf below sits
         in the house, which is the whole idea stated in one class.

         Deliberately NOT overflow-hidden. The panel used to clip its own
         children, which meant the tooltips on the buttons at its right edge
         were cut in half by the edge they sat against. The two things that
         actually need clipping — the bloom, which is thrown from outside the
         box, and the grain, whose ::after is a square inset:0 that would show
         its corners against the rounding — are clipped by the layer below
         instead. The panel's own background needs no help; backgrounds
         respect border-radius on their own. */
      className="dark stage-scene relative isolate rounded-2xl border border-[var(--stage-line)] px-5 py-7 text-[var(--stage-fg)] sm:px-9 sm:py-10"
    >
      {/* The decoration, and the only thing that clips. */}
      <div
        aria-hidden
        className="stage-grain pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
      >
        {/* One warm bloom, thrown from behind the poster. */}
        <div className="absolute -left-24 -top-28 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--stage-glow),transparent_68%)] opacity-70" />
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-9">
        <motion.div
          initial={{ opacity: 0, y: 16, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.55, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="w-32 shrink-0 sm:w-44"
        >
          <Link
            href={`/monologue/${monologue.id}`}
            className="block overflow-hidden rounded-sm shadow-[0_22px_50px_-18px_rgba(0,0,0,0.9)] ring-1 ring-white/15 transition-transform hover:-translate-y-0.5"
          >
            {poster ? (
              <div className="relative aspect-[2/3]">
                <Image
                  src={poster}
                  alt={`${monologue.play_title} poster`}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 128px, 176px"
                  className="object-cover"
                  priority
                />
              </div>
            ) : (
              <PlayCover
                title={monologue.play_title}
                author={monologue.author}
                year={monologue.year}
                genre={monologue.genre}
                category={monologue.category}
                themes={monologue.themes}
              />
            )}
          </Link>
        </motion.div>

        <div className="min-w-0 flex-1">
          <p className="stage-direction text-sm text-[var(--stage-faint)]">
            {state.direction}
          </p>
          <h2 className="mt-1.5 font-brand text-4xl font-medium leading-[1.02] sm:text-5xl">
            <Link
              href={`/monologue/${monologue.id}`}
              className="transition-colors hover:text-primary"
            >
              {lead}
            </Link>
          </h2>
          {source && (
            <p className="mt-2 font-typewriter text-sm text-[var(--stage-muted)]">
              {source}
            </p>
          )}

          {/* The piece itself, not a summary of it. Masked rather than
              truncated with an ellipsis: a line that fades has more behind it,
              a line ending in "…" has been cut short. */}
          {excerpt && (
            <p
              className="mt-5 max-w-prose font-typewriter text-[15px] leading-[1.85] text-[var(--stage-muted)] sm:text-base"
              style={{
                maskImage: "linear-gradient(180deg,#000 45%,transparent)",
                WebkitMaskImage: "linear-gradient(180deg,#000 45%,transparent)",
                maxHeight: "7.5em",
                overflow: "hidden",
              }}
            >
              {excerpt}
            </p>
          )}

          {facts.length > 0 && (
            <p className="mt-4 font-typewriter text-xs text-[var(--stage-faint)]">
              {facts.join("  ·  ")}
            </p>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button asChild size="lg" className="px-7">
              <Link href={state.primary.href(monologue.id)}>
                {state.primary.label}
              </Link>
            </Button>

            <Link
              href={`/monologue/${monologue.id}`}
              className="text-sm text-[var(--stage-muted)] underline-offset-4 transition-colors hover:text-[var(--stage-fg)] hover:underline"
            >
              Read it
            </Link>
            {state.offerDrill && (
              <Link
                href={`/monologue/${monologue.id}/memorize`}
                className="text-sm text-[var(--stage-muted)] underline-offset-4 transition-colors hover:text-[var(--stage-fg)] hover:underline"
              >
                {memorized ? "Drill it" : "Get it off book"}
              </Link>
            )}

            <span className="ml-auto flex items-center gap-1">
              <InstantTooltip
                align="end"
                label={memorized ? "Off book. Tap to unmark." : "Mark as off book"}
              >
                <button
                  type="button"
                  onClick={onToggleMemorized}
                  aria-pressed={memorized}
                  aria-label={memorized ? "Off book" : "Mark as off book"}
                  className="rounded-full p-2 text-[var(--stage-muted)] transition-colors hover:bg-white/10 hover:text-[var(--stage-fg)]"
                >
                  {memorized ? (
                    <IconBulbFilled className="h-5 w-5 text-amber-400" />
                  ) : (
                    <IconBulb className="h-5 w-5" />
                  )}
                </button>
              </InstantTooltip>
              <InstantTooltip align="end" label="Remove from collection">
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="Remove from collection"
                  className="rounded-full p-2 text-[var(--stage-faint)] transition-colors hover:bg-white/10 hover:text-[var(--stage-fg)]"
                >
                  <IconX className="h-5 w-5" />
                </button>
              </InstantTooltip>
            </span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

export default Bench;
