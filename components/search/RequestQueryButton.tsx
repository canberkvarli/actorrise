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

  const q = query.trim();
  if (!q) return null;

  async function handleRequest() {
    setLoading(true);
    try {
      await api.post("/api/monologues/content-request", { query: q });
      setRequested(true);
    } catch {
      // Silently fail — filing a request is a nicety, not a critical path.
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
        {requested ? "Requested" : loading ? "Requesting..." : "Request this"}
      </Button>
      {requested && (
        <span className="ml-3 text-xs text-muted-foreground">
          Noted, thanks. I&apos;ll look for it.
        </span>
      )}
    </div>
  );
}
