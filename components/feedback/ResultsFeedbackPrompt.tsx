"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { IconThumbUp, IconThumbDown } from "@tabler/icons-react";
import api from "@/lib/api";

const STORAGE_KEY_PREFIX = "feedback_dismissed_";

export interface ResultsFeedbackPromptProps {
  /** Context for sessionStorage so we don't re-ask in the same session (e.g. "search"). */
  context?: string;
  /** When >= 1, prompt is shown (every search). Pass the current results view count from the search page. */
  resultsViewCount?: number;
  /** Called when user clicks "Tell us more" to open the contact/feedback modal. */
  onOpenContact?: () => void;
}

export function ResultsFeedbackPrompt({
  context = "search",
  resultsViewCount = 0,
  onOpenContact,
}: ResultsFeedbackPromptProps) {
  const [submitted, setSubmitted] = useState<boolean | null>(null);

  const storageKey = `${STORAGE_KEY_PREFIX}${context}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dismissed = sessionStorage.getItem(storageKey);
      if (dismissed === "true") setSubmitted(true);
    } catch {
      // ignore
    }
  }, [storageKey]);

  const handleVote = (positive: boolean) => {
    const rating = positive ? "positive" : "negative";
    api
      .post("/api/feedback", { context, rating })
      .catch(() => { /* fire-and-forget; don't block UX */ });
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
    setSubmitted(true);
  };

  // Show feedback whenever we have a results view (count >= 1); after vote we show thanks
  const showPrompt = resultsViewCount >= 1;
  if (!showPrompt) return null;

  // Already voted this session: show brief thanks
  if (submitted === true) {
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
      className="flex flex-wrap items-center justify-center gap-2 py-2 px-3 rounded-lg border border-border/50 bg-muted/20 w-fit mx-auto mb-2"
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
