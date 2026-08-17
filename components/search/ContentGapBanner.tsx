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

  // We have it, the tab filtered it out. Point them at it.
  if (availableIn && availableIn.length > 0) {
    const target = availableIn[0];
    return (
      <div className="border border-border bg-card p-4 space-y-2">
        <p className="text-sm">
          <span className="font-semibold">{label}</span> is in{" "}
          {sourceLabel(availableIn)}, not here.
        </p>
        {onSwitchSource && (
          <Button
            size="sm"
            className="bg-[#CB4B00] text-white hover:bg-[#B03000]"
            onClick={() => onSwitchSource(target)}
          >
            Show me {sourceLabel(availableIn)}
          </Button>
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
    <div className="border border-border bg-card p-4 space-y-2">
      <p className="text-sm">
        I don&apos;t have <span className="font-semibold">{label}</span> yet.
      </p>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRequest}
          disabled={requested || loading}
        >
          {requested ? "Requested" : loading ? "Requesting..." : "Request this play"}
        </Button>
        {requested && (
          <span className="text-xs text-muted-foreground">
            Noted, thanks. I&apos;ll look for it.
          </span>
        )}
      </div>
      {!requested && (
        <p className="text-xs text-muted-foreground">
          Here are monologues with a similar feel:
        </p>
      )}
    </div>
  );
}
