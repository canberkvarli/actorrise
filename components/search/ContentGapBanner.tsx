"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useT, type MessageKey } from "@/lib/i18n";
import { withSlots, useJoinList } from "@/components/search/searchI18n";

interface ContentGapBannerProps {
  play: string | null;
  author: string | null;
  /**
   * source_types the title DOES exist under, when the current tab is what hid
   * it. Present means we carry the thing and must not claim otherwise.
   */
  availableIn?: string[] | null;
  /**
   * The play (or author) is in the catalogue with zero monologues. Different
   * sentence from "we don't have it": the actor named something we know, the
   * shelf is just empty, and the request goes out with the author attached.
   */
  carriedButEmpty?: boolean;
  /** Switch the search tab to where the title actually lives. */
  onSwitchSource?: (sourceType: string) => void;
}

const SOURCE_LABELS: Record<string, MessageKey> = {
  play: "appSearchGap.plays",
  film: "appSearchGap.filmTv",
  tv: "appSearchGap.filmTv",
};

/**
 * Two different messages, because they are two different facts.
 *
 * Searching "fleabag" on the Plays tab used to say "We don't have Fleabag in our
 * library yet" and offer to request it, while six Fleabag monologues sat in the
 * library tagged source_type "tv". Telling an actor you lack something you have
 * is worse than returning nothing: they leave and they do not come back to check.
 */
export function ContentGapBanner({
  play,
  author,
  availableIn,
  carriedButEmpty,
  onSwitchSource,
}: ContentGapBannerProps) {
  const t = useT();
  const joinList = useJoinList();
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!play && !author) return null;

  const sourceLabel = (types: string[]): string =>
    joinList(Array.from(new Set(types.map((s) => (SOURCE_LABELS[s] ? t(SOURCE_LABELS[s]) : s)))));

  const label =
    play && author
      ? t("appSearchGap.playBy", { play, author })
      : play || t("appSearchGap.worksBy", { author: author ?? "" });
  const bold = <span className="font-semibold">{label}</span>;

  // We have it, the tab filtered it out. Point them at it. Compact inline row —
  // it sits above unrelated same-tab results, so it must read as a quiet redirect,
  // not a full-bleed "nothing here" box that contradicts the results below.
  if (availableIn && availableIn.length > 0) {
    const target = availableIn[0];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-primary bg-muted/30 px-3 py-2.5 text-sm">
        <span className="text-foreground">
          {withSlots(t("appSearchGap.livesIn", { where: sourceLabel(availableIn) }), { label: bold })}
        </span>
        {onSwitchSource && (
          <button
            type="button"
            onClick={() => onSwitchSource(target)}
            className="font-medium text-primary underline-offset-4 hover:underline dark:text-[#e56320]"
          >
            {t("appSearchGap.takeMeThere")}
          </button>
        )}
      </div>
    );
  }

  async function handleRequest() {
    setLoading(true);
    try {
      await api.post("/api/monologues/content-request", {
        play_title: play || author || "",
        author: author || null,
      });
      setRequested(true);
    } catch {
      // silently fail - not critical
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-primary bg-muted/30 px-3 py-2.5 text-sm">
      <span className="text-foreground">
        {carriedButEmpty ? (
          withSlots(t("appSearchGap.carriedEmpty"), { label: bold })
        ) : (
          withSlots(t("appSearchGap.notYet"), { label: bold })
        )}
        {!requested && <span className="text-muted-foreground">{t("appSearchGap.closestBelow")}</span>}
      </span>
      {requested ? (
        <span className="text-xs text-muted-foreground">{t("appSearchGap.noted")}</span>
      ) : (
        <button
          type="button"
          onClick={handleRequest}
          disabled={loading}
          className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60 dark:text-[#e56320]"
        >
          {loading ? t("appSearchGap.requesting") : t("appSearchGap.requestIt")}
        </button>
      )}
    </div>
  );
}
