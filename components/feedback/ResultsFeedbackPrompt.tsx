"use client";

import { useState } from "react";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";
import api from "@/lib/api";

const VOTE_STORAGE_PREFIX = "feedback_voted_";

export interface ResultsFeedbackPromptProps {
  /** Context for the feedback API (e.g. "search"). */
  context?: string;
  /** When >= 1, prompt is shown. A new count = a new search = ask again. */
  resultsViewCount?: number;
  /** Opened when the user votes "not helpful", so they can say why. */
  onOpenContact?: () => void;
}

function getVoteStorageKey(context: string, count: number): string {
  return `${VOTE_STORAGE_PREFIX}${context}_${count}`;
}

function hasStoredVote(context: string, count: number): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(getVoteStorageKey(context, count)) === "true";
  } catch {
    return false;
  }
}

/**
 * One quiet line under the results: "Helpful? 👍 👎". Records a positive/negative
 * vote (fire-and-forget); a "not helpful" tap opens the contact form for detail.
 */
export function ResultsFeedbackPrompt({
  context = "search",
  resultsViewCount = 0,
  onOpenContact,
}: ResultsFeedbackPromptProps) {
  // Track votes made this session per result-set count. Derived (not synced via
  // an effect) so a new search count naturally re-asks.
  const [votedCounts, setVotedCounts] = useState<Record<number, boolean>>({});

  const vote = (positive: boolean) => {
    api
      .post("/api/feedback", { context, rating: positive ? "positive" : "negative" })
      .catch(() => { /* fire-and-forget */ });
    try {
      sessionStorage.setItem(getVoteStorageKey(context, resultsViewCount), "true");
    } catch {
      // ignore
    }
    setVotedCounts((v) => ({ ...v, [resultsViewCount]: true }));
    if (!positive) onOpenContact?.();
  };

  if (resultsViewCount < 1) return null;

  const submitted = votedCounts[resultsViewCount] ?? hasStoredVote(context, resultsViewCount);

  if (submitted) {
    return <p className="py-1 text-center text-xs text-muted-foreground/50">Thanks</p>;
  }

  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground/70">
      <span>Helpful?</span>
      <button
        type="button"
        onClick={() => vote(true)}
        aria-label="Yes, helpful"
        className="rounded p-1.5 transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <IconThumbUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => vote(false)}
        aria-label="No, not helpful"
        className="rounded p-1.5 transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <IconThumbDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
