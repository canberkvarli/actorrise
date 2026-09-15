"use client";

import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Glyph, glyphFor } from "@/components/brand/glyphs";

/**
 * The empty stage. Three ways a search comes back with nothing, each said
 * plainly and each offering the next move rather than just reporting failure:
 * an unreadable query, too short a query, or a real gap in the library.
 */

export type NoResultsReason = "none" | "gibberish" | "short";

const COPY: Record<
  NoResultsReason,
  { direction: string; title: string; body: string }
> = {
  none: {
    direction: "(an empty stage.)",
    title: "Nothing matched that.",
    body: "Try fewer words, or drop a filter. If a piece should be here and isn't, tell me and I'll go find it.",
  },
  gibberish: {
    direction: "(line?)",
    title: "I couldn't read that one.",
    body: "Describe what you're after, like “funny monologue for a woman in her 20s”, or just name the play.",
  },
  short: {
    direction: "(go on.)",
    title: "Give me a little more.",
    body: "A few more words and I can place it. Something like “sad monologue about losing someone”.",
  },
};

interface NoResultsStateProps {
  reason: NoResultsReason;
  /** The search that found nothing, quoted back so the screen names it. */
  query?: string;
  /** Number of active filters — offering to clear them is often the real fix. */
  activeFilterCount?: number;
  onClearFilters?: () => void;
  /** The "ask me to add this" action, owned by the page. */
  children?: React.ReactNode;
}

export function NoResultsState({
  reason,
  query,
  activeFilterCount = 0,
  onClearFilters,
  children,
}: NoResultsStateProps) {
  const copy = COPY[reason];
  // "Nothing matched that" left the actor to guess which "that". Naming the
  // search is what makes the three exits below read as answers to it.
  const title =
    reason === "none" && query?.trim() ? (
      <>
        No close matches for <span className="italic">{query.trim()}</span>.
      </>
    ) : (
      copy.title
    );
  /* The catalogue maps state:no-results to the script and pen, which is also
     feature:request — the same mark for "nothing here" and "ask me to add it",
     which is exactly the move this screen offers. One glyph for all three
     reasons: the copy is what differentiates them, and the house rule is one
     glyph per view, not one per variant. */
  const glyph = glyphFor("state:no-results") ?? "script-pen";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
    >
      {/* 88 is the catalogue's empty-state size; muted ink, never the orange. */}
      <Glyph name={glyph} size={88} className="t-empty-glyph" />

      <p className="t-dir mt-6" style={{ color: "var(--t-muted-dark-2)" }}>
        {copy.direction}
      </p>
      <h3
        className="mt-3"
        style={{
          fontFamily: "var(--t-display)",
          fontWeight: 400,
          fontSize: "clamp(1.9rem, 4vw, 2.6rem)",
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          color: "var(--t-text)",
        }}
      >
        {title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--t-muted-dark)" }}>
        {copy.body}
      </p>

      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
        {/* Filters are the usual culprit, so make undoing them one tap */}
        {activeFilterCount > 0 && onClearFilters && (
          <button type="button" onClick={onClearFilters} className="t-show-more">
            Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
          </button>
        )}
        {children}
      </div>
    </motion.div>
  );
}

export default NoResultsState;
