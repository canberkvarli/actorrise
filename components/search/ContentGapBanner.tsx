"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface ContentGapBannerProps {
  play: string | null;
  author: string | null;
}

export function ContentGapBanner({ play, author }: ContentGapBannerProps) {
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!play && !author) return null;

  const label = play && author
    ? `${play} by ${author}`
    : play || `works by ${author}`;

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
        We don&apos;t have <span className="font-semibold">{label}</span> in our library yet.
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
            We&apos;ve noted your interest. Thanks!
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
