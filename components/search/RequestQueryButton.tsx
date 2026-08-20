"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

/**
 * "Request this" for a raw search string — no named play/author required.
 *
 * The content-gap banner only fires when a specific missing title/author is
 * identified. Vibe searches ("sarcastic two hander") never name a title, so a
 * weak or empty result used to dead-end. This files the raw query so it lands
 * in the same admin content roadmap as a named request.
 */
export function RequestQueryButton({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const q = query.trim();
  if (!q) return null;

  async function handleRequest() {
    setLoading(true);
    setFailed(false);
    try {
      await api.post("/api/monologues/content-request", { query: q });
      setRequested(true);
    } catch (err) {
      // A failure here used to be swallowed entirely, which made the button
      // indistinguishable from a working one — and content_requests sat at 2
      // rows lifetime with no way to tell "nobody clicked" from "every click
      // failed" (H-09). Say so, log it, and leave the button clickable.
      console.error("Content request failed:", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleRequest}
        disabled={requested || loading}
      >
        {requested
          ? "Requested"
          : loading
          ? "Requesting..."
          : failed
          ? "Try again"
          : "Request this"}
      </Button>
      {requested && (
        <span className="ml-3 text-xs text-muted-foreground">
          Noted, thanks. I&apos;ll look for it.
        </span>
      )}
      {failed && (
        <span className="ml-3 text-xs text-muted-foreground">
          That didn&apos;t go through.
        </span>
      )}
    </div>
  );
}
