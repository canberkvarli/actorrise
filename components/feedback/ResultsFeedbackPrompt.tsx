"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";
import api from "@/lib/api";

const VOTE_STORAGE_PREFIX = "feedback_voted_";

export interface ResultsFeedbackPromptProps {
  /** Context for the feedback API (e.g. "search"). */
  context?: string;
  /** When >= 1, prompt is shown. New count = new search = show question; same count after refresh = show Thanks if already voted. */
  resultsViewCount?: number;
  /** Called when user clicks "Tell us more" to open the contact/feedback modal. */
  onOpenContact?: () => void;
}

function getVoteStorageKey(context: string, count: number): string {
  return `${VOTE_STORAGE_PREFIX}${context}_${count}`;
}

export function ResultsFeedbackPrompt({
  context = "search",
  resultsViewCount = 0,
  onOpenContact,
}: ResultsFeedbackPromptProps) {
  const [submitted, setSubmitted] = useState(false);

  // For this result set (resultsViewCount): if we already voted for this count, show Thanks; else show question
  useEffect(() => {
    if (typeof window === "undefined" || resultsViewCount < 1) return;
    const key = getVoteStorageKey(context, resultsViewCount);
    try {
      setSubmitted(sessionStorage.getItem(key) === "true");
    } catch {
      setSubmitted(false);
    }
  }, [context, resultsViewCount]);

  const handleVote = (positive: boolean) => {
    const rating = positive ? "positive" : "negative";
    api
      .post("/api/feedback", { context, rating })
      .catch(() => { /* fire-and-forget; don't block UX */ });
    try {
      sessionStorage.setItem(getVoteStorageKey(context, resultsViewCount), "true");
    } catch {
      // ignore
    }
    setSubmitted(true);
  };

  // Show feedback whenever we have a results view (count >= 1)
  const showPrompt = resultsViewCount >= 1;
  if (!showPrompt) return null;

  // Just voted for this result set: show brief thanks until next search
  if (submitted) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-xs text-muted-foreground py-2"
      >
        Thanks for your feedback!
      </motion.p>
    );
  }

  // Not yet voted: compact prompt with gentle pop-in, right above the cards
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-1.5 sm:gap-2 py-2 px-3 rounded-lg border border-border/50 bg-muted/20 w-fit max-w-full"
    >
      <p className="text-xs font-medium text-muted-foreground whitespace-nowrap">
        Were these results what you expected?
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleVote(true)}
          className="h-7 gap-1 rounded-full text-xs px-2.5"
          aria-label="Yes, results were helpful"
        >
          <IconThumbUp className="h-3.5 w-3.5" />
          Yes
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleVote(false)}
          className="h-7 gap-1 rounded-full text-xs px-2.5"
          aria-label="No, results were not what I expected"
        >
          <IconThumbDown className="h-3.5 w-3.5" />
          No
        </Button>
        {onOpenContact && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenContact}
            className="h-7 text-xs text-muted-foreground hover:text-foreground rounded-full px-2"
          >
            Tell us more
          </Button>
        )}
      </div>
    </motion.div>
  );
}
