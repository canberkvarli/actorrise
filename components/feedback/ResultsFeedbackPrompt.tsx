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
  /** @deprecated Negative feedback now captures the reason inline; no longer opens the contact form. */
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
 * One quiet line under the results: "Helpful? 👍 👎". A thumbs-up records a
 * positive vote right away. A thumbs-down opens an inline reason box — the
 * negative is only recorded together with the reason, so we never log an
 * anonymous down-vote (cancelling saves nothing). Mirrors the backend, which
 * requires a comment on negative feedback.
 */
export function ResultsFeedbackPrompt({
  context = "search",
  resultsViewCount = 0,
}: ResultsFeedbackPromptProps) {
  // Handled = a positive vote or a negative-with-reason was submitted, tracked
  // per result-set count so a new search naturally re-asks.
  const [handledCounts, setHandledCounts] = useState<Record<number, boolean>>({});
  // The count currently showing the "leave a reason" box (after a thumbs-down).
  const [reasonForCount, setReasonForCount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const markHandled = () => {
    try {
      sessionStorage.setItem(getVoteStorageKey(context, resultsViewCount), "true");
    } catch {
      // ignore
    }
    setHandledCounts((v) => ({ ...v, [resultsViewCount]: true }));
  };

  const submitPositive = () => {
    api.post("/api/feedback", { context, rating: "positive" }).catch(() => { /* fire-and-forget */ });
    markHandled();
  };

  const submitNegative = async () => {
    const comment = reason.trim();
    if (!comment || submitting) return;
    setSubmitting(true);
    try {
      await api.post("/api/feedback", { context, rating: "negative", comment });
    } catch {
      // Best-effort: still thank them; the reason is the point, not a retry loop.
    }
    setSubmitting(false);
    setReason("");
    setReasonForCount(null);
    markHandled();
  };

  const cancelReason = () => {
    // A bare down-vote records nothing.
    setReason("");
    setReasonForCount(null);
  };

  if (resultsViewCount < 1) return null;

  const handled = handledCounts[resultsViewCount] ?? hasStoredVote(context, resultsViewCount);
  if (handled) {
    return <p className="py-1 text-center text-xs text-muted-foreground/50">Thanks</p>;
  }

  // After a thumbs-down: ask what they were hoping to find before recording.
  if (reasonForCount === resultsViewCount) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-2 py-2">
        <label htmlFor="feedback-reason" className="text-center text-xs text-muted-foreground/80">
          What were you hoping to find?
        </label>
        <textarea
          id="feedback-reason"
          autoFocus
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitNegative();
          }}
          placeholder="e.g. a contemporary comedic piece under 2 minutes"
          className="w-full resize-none rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={cancelReason}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitNegative}
            disabled={!reason.trim() || submitting}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    );
  }

  // Idle: the quiet "Helpful?" line.
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground/70">
      <span>Helpful?</span>
      <button
        type="button"
        onClick={submitPositive}
        aria-label="Yes, helpful"
        className="rounded p-1.5 transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <IconThumbUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setReasonForCount(resultsViewCount);
        }}
        aria-label="No, not helpful"
        className="rounded p-1.5 transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <IconThumbDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
