"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { IconBulb, IconBulbFilled } from "@tabler/icons-react";

import { PlayCover } from "@/components/monologue/PlayCover";
import { posterAt } from "@/lib/poster";
import {
  benchState,
  leadName,
  sourceLine,
  titleCase,
  type BenchStateKey,
} from "@/lib/collectionMeta";
import type { Monologue } from "@/types/actor";
import { useT, type MessageKey } from "@/lib/i18n";

type Translate = ReturnType<typeof useT>;

/** lib/collectionMeta's bench words, by state, in the active language. */
const STATE_WORDS: Record<BenchStateKey, { direction: MessageKey; cta: MessageKey }> = {
  cold: { direction: "appScenesBench.dirCold", cta: "appScenesBench.ctaCold" },
  "off-book": { direction: "appScenesBench.dirOffBook", cta: "appScenesBench.ctaOffBook" },
  "in-progress": { direction: "appScenesBench.dirInProgress", cta: "appScenesBench.ctaInProgress" },
  fresh: { direction: "appScenesBench.dirFresh", cta: "appScenesBench.ctaFresh" },
};

/* The facts row. Same arithmetic as formatDuration, sourceLabel and
   lastWorkedLabel in lib/collectionMeta, said through the dictionary. */
function duration(t: Translate, seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  return t("appScenesBench.minutes", { n: Math.max(1, Math.round(seconds / 60)) });
}

function source(t: Translate, sourceType?: string | null): string | null {
  if (sourceType === "film" || sourceType === "tv") return t("appScenesBench.filmTv");
  if (sourceType === "play") return t("appScenesBench.play");
  return null;
}

function lastWorked(t: Translate, iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return t("appScenesBench.workedToday");
  if (days === 1) return t("appScenesBench.workedYesterday");
  if (days < 30) return t("appScenesBench.workedDays", { n: days });
  const months = Math.floor(days / 30);
  return months === 1 ? t("appScenesBench.workedMonth") : t("appScenesBench.workedMonths", { n: months });
}

/**
 * The piece you are working on, at working size, on a lit panel.
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
 *
 * Styling lives in `.t-bench*` in globals.css rather than in utilities,
 * because the bench holds its ink ground in light and dark alike — it is a
 * lit surface, not a card that follows the theme — and that is a statement
 * about the whole page, not a class on one div.
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
  const t = useT();
  const state = benchState(monologue);
  const words = STATE_WORDS[state.key];
  const memorized = Boolean(monologue.memorized);
  const poster = posterAt(monologue.poster_url, 600);
  const lead = leadName(monologue);
  const playLine = sourceLine(monologue);

  const facts = [
    duration(t, monologue.estimated_duration_seconds),
    source(t, monologue.source_type),
    // The tone is the database's word; it stays as the library says it.
    titleCase(monologue.tone),
    lastWorked(t, monologue.last_studied_at),
  ].filter((f): f is string => Boolean(f));

  const excerpt = monologue.text?.replace(/\s+/g, " ").trim() ?? "";

  return (
    <motion.section
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
      id="collection-bench"
      className="t-bench"
      data-off-book={memorized}
    >
      <div aria-hidden className="t-bench__bloom" />
      <div aria-hidden className="t-bench__grain" />

      {/* The practical, burning at full only when the piece is off book. */}
      <div aria-hidden className="t-bench__lamp">
        <span className="t-bench__flex" />
        <span className="t-bench__socket" />
        <span className="t-bench__bulb" />
      </div>

      <div className="t-bench__grid">
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: -6 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="t-bench__cover"
        >
          <Link href={`/monologue/${monologue.id}`} className="t-cover">
            {/* Off book, marked on the cover the way a spine is taped. */}
            {memorized && <span aria-hidden className="t-cover__mark" />}
            {poster ? (
              <div className="relative aspect-[2/3]">
                <Image
                  src={poster}
                  alt={t("appScenesBench.poster", { title: monologue.play_title })}
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 132px, 180px"
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

        <div className="t-bench__body">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="t-dir t-bench__dir"
            data-bench-state={state.key}
          >
            {t(words.direction)}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="t-bench__name"
          >
            <Link href={`/monologue/${monologue.id}`}>{lead}</Link>
          </motion.h2>

          {playLine && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="t-bench__source"
            >
              {playLine}
            </motion.p>
          )}

          {/* The piece itself, not a summary of it. Masked rather than
              truncated with an ellipsis: a line that fades has more behind it,
              a line ending in "…" has been cut short. */}
          {excerpt && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="t-bench__text"
            >
              &ldquo;{excerpt}
            </motion.p>
          )}

          {facts.length > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="t-bench__facts"
            >
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </motion.p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="t-bench__actions"
          >
            <Link
              href={state.primary.href(monologue.id)}
              className="t-cta t-cta--bench"
            >
              {t(words.cta)}
              <span aria-hidden className="t-cta__dot">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 4v16l13-8z" />
                </svg>
              </span>
            </Link>

            <Link href={`/monologue/${monologue.id}`} className="t-bench__quiet">
              {t("appScenesBench.readIt")}
            </Link>
            {state.offerDrill && (
              <Link
                href={`/monologue/${monologue.id}/memorize`}
                className="t-bench__quiet"
              >
                {memorized ? t("appScenesBench.drillIt") : t("appScenesBench.getOffBook")}
              </Link>
            )}

            <span className="t-bench__tools">
              {/* The off-book toggle says what it is rather than hiding behind
                  a bulb in a tooltip. It is the one piece of state on this
                  panel the actor sets by hand, and on a phone a tooltip is
                  not a thing you can read. */}
              <button
                type="button"
                onClick={onToggleMemorized}
                aria-pressed={memorized}
                title={memorized ? t("appScenesBench.unmarkTitle") : t("appScenesBench.markTitle")}
                className="t-memo"
              >
                {memorized ? (
                  <IconBulbFilled className="h-4 w-4" aria-hidden />
                ) : (
                  <IconBulb className="h-4 w-4" aria-hidden />
                )}
                {memorized ? t("appScenesBench.offBook") : t("appScenesBench.markOffBook")}
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={t("appScenesBench.remove")}
                title={t("appScenesBench.remove")}
                className="t-drop"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

export default Bench;
