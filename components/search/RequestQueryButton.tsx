"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/lib/api";

/**
 * "Request this" for a raw search string — no named play/author required.
 *
 * The content-gap banner only fires when a specific missing title/author is
 * identified. Vibe searches ("sarcastic two hander") never name a title, so a
 * weak or empty result used to dead-end. This files the raw query so it lands
 * in the same admin content roadmap as a named request.
 *
 * Since 2026-09-08 it asks one question first: is this the name of a play,
 * film or show? The queue had filled with "monologues for women" and "High
 * stakes", phrases nobody can go and find. A title is filed, with the author
 * if the actor knows it; anything else is sent back into the search, which
 * is the only place a description can be answered.
 */
export function RequestQueryButton({
  query,
  className,
}: {
  query: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isTitle, setIsTitle] = useState(false);
  const [author, setAuthor] = useState("");
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const q = query.trim();
  if (!q) return null;

  async function handleRequest() {
    setLoading(true);
    setFailed(false);
    try {
      await api.post("/api/monologues/content-request", {
        query: q,
        is_title: true,
        author: author.trim() || null,
      });
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

  if (requested) {
    return (
      <div className={className}>
        <span className="text-xs text-muted-foreground">Noted, thanks. I&apos;ll look for it.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className={className}>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Request this
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex w-full max-w-sm flex-col items-stretch gap-3 text-left">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-primary"
            checked={isTitle}
            onChange={(e) => setIsTitle(e.target.checked)}
          />
          <span>
            <span className="font-medium">{q}</span> is the name of a play, film or show
          </span>
        </label>
        {isTitle ? (
          <>
            <Input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Who wrote it? (optional, but it helps me find it)"
              className="h-9 text-sm"
              maxLength={120}
            />
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={handleRequest} disabled={loading}>
                {loading ? "Requesting..." : failed ? "Try again" : "Request it"}
              </Button>
              {failed && <span className="text-xs text-muted-foreground">That didn&apos;t go through.</span>}
            </div>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Not a title? Then it&apos;s a description, and the search is the place for it.
            Say who the character is and what the moment feels like, or pick a feeling below.
          </p>
        )}
      </div>
    </div>
  );
}
