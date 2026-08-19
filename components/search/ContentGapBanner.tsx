"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface ContentGapBannerProps {
  play: string | null;
  author: string | null;
  /**
   * source_types the title DOES exist under, when the current tab is what hid
   * it. Present means we carry the thing and must not claim otherwise.
   */
  availableIn?: string[] | null;
  /** Switch the search tab to where the title actually lives. */
  onSwitchSource?: (sourceType: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  play: "Plays",
  film: "Film & TV",
  tv: "Film & TV",
};

function sourceLabel(types: string[]): string {
  const labels = Array.from(new Set(types.map((t) => SOURCE_LABELS[t] ?? t)));
  return labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels.at(-1) : labels[0];
}

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
  onSwitchSource,
}: ContentGapBannerProps) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!play && !author) return null;

  const label = play && author ? `${play} by ${author}` : play || `works by ${author}`;

  // We have it, the tab filtered it out. Point them at it. Compact inline row —
  // it sits above unrelated same-tab results, so it must read as a quiet redirect,
  // not a full-bleed "nothing here" box that contradicts the results below.
  if (availableIn && availableIn.length > 0) {
    const target = availableIn[0];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-[#CB4B00] bg-muted/30 px-3 py-2.5 text-sm">
        <span className="text-foreground">
          <span className="font-semibold">{label}</span> lives in {sourceLabel(availableIn)}.
        </span>
        {onSwitchSource && (
          <button
            type="button"
            onClick={() => onSwitchSource(target)}
            className="font-medium text-[#CB4B00] underline-offset-4 hover:underline dark:text-[#e56320]"
          >
            Take me there →
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-l-2 border-l-[#CB4B00] bg-muted/30 px-3 py-2.5 text-sm">
      <span className="text-foreground">
        No <span className="font-semibold">{label}</span> yet
        {!requested && <span className="text-muted-foreground"> — closest pieces below.</span>}
      </span>
      {requested ? (
        <span className="text-xs text-muted-foreground">Noted, thanks. I&apos;ll look for it.</span>
      ) : (
        <button
          type="button"
          onClick={handleRequest}
          disabled={loading}
          className="font-medium text-[#CB4B00] underline-offset-4 hover:underline disabled:opacity-60 dark:text-[#e56320]"
        >
          {loading ? "Requesting…" : "Request it →"}
        </button>
      )}
    </div>
  );
}
