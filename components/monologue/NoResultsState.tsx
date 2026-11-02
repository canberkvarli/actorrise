"use client";

import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Glyph, glyphFor } from "@/components/brand/glyphs";
import { useT, type MessageKey } from "@/lib/i18n";

/**
 * The empty stage. Three ways a search comes back with nothing, each said
 * plainly and each offering the next move rather than just reporting failure:
 * an unreadable query, too short a query, or a real gap in the library.
 */

export type NoResultsReason = "none" | "gibberish" | "short";

const COPY: Record<
  NoResultsReason,
  { direction: MessageKey; title: MessageKey; body: MessageKey }
> = {
  none: {
    direction: "appMonologueNoResults.noneDirection",
    title: "appMonologueNoResults.noneTitle",
    body: "appMonologueNoResults.noneBody",
  },
  gibberish: {
    direction: "appMonologueNoResults.gibberishDirection",
    title: "appMonologueNoResults.gibberishTitle",
    body: "appMonologueNoResults.gibberishBody",
  },
  short: {
    direction: "appMonologueNoResults.shortDirection",
    title: "appMonologueNoResults.shortTitle",
    body: "appMonologueNoResults.shortBody",
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
  const t = useT();
  const copy = COPY[reason];
  // "Nothing matched that" left the actor to guess which "that". Naming the
  // search is what makes the three exits below read as answers to it.
  const title =
    reason === "none" && query?.trim() ? (
      <>
        {t("appMonologueNoResults.forA")}
        <span className="italic">{query.trim()}</span>
        {t("appMonologueNoResults.forB")}
      </>
    ) : (
      t(copy.title)
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
        {t(copy.direction)}
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
        {t(copy.body)}
      </p>

      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row">
        {/* Filters are the usual culprit, so make undoing them one tap */}
        {activeFilterCount > 0 && onClearFilters && (
          <button type="button" onClick={onClearFilters} className="t-show-more">
            {activeFilterCount === 1
              ? t("appMonologueNoResults.clearOne")
              : t("appMonologueNoResults.clearMany", { n: activeFilterCount })}
          </button>
        )}
        {children}
      </div>
    </motion.div>
  );
}

export default NoResultsState;
