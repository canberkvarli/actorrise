"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconThumbUp, IconThumbDown, IconSend, IconX } from "@tabler/icons-react";
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
  const [showNegativeInput, setShowNegativeInput] = useState(false);
  const [negativeReason, setNegativeReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // For this result set (resultsViewCount): if we already voted for this count, show Thanks; else show question
  useEffect(() => {
    if (typeof window === "undefined" || resultsViewCount < 1) return;
    const key = getVoteStorageKey(context, resultsViewCount);
    try {
      setSubmitted(sessionStorage.getItem(key) === "true");
    } catch {
      setSubmitted(false);
    }
    // Reset negative input state on new search
    setShowNegativeInput(false);
    setNegativeReason("");
  }, [context, resultsViewCount]);

  // Focus textarea when negative input is shown
  useEffect(() => {
    if (showNegativeInput && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [showNegativeInput]);

  const handleVote = (positive: boolean, comment?: string) => {
    const rating = positive ? "positive" : "negative";
    api
      .post("/api/feedback", { context, rating, comment })
      .catch(() => { /* fire-and-forget; don't block UX */ });
    try {
      sessionStorage.setItem(getVoteStorageKey(context, resultsViewCount), "true");
    } catch {
      // ignore
    }
    setSubmitted(true);
    setShowNegativeInput(false);
    setNegativeReason("");
  };

  const handleNegativeClick = () => {
    setShowNegativeInput(true);
  };

  const handleSubmitNegative = () => {
    if (!negativeReason.trim()) return;
    setIsSubmitting(true);
    handleVote(false, negativeReason.trim());
    setIsSubmitting(false);
  };

  const handleCancelNegative = () => {
    setShowNegativeInput(false);
    setNegativeReason("");
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
      className="flex flex-col items-center gap-2 py-2 px-3 rounded-lg border border-border/50 bg-muted/20 w-fit max-w-full"
    >
      <AnimatePresence mode="wait">
        {!showNegativeInput ? (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-1.5 sm:gap-2"
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
                onClick={handleNegativeClick}
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
        ) : (
          <motion.div
            key="negative-input"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col gap-2 w-full min-w-[280px] max-w-md"
          >
            <p className="text-xs font-medium text-muted-foreground">
              What were you looking for?
            </p>
            <Textarea
              ref={textareaRef}
              value={negativeReason}
              onChange={(e) => setNegativeReason(e.target.value)}
              placeholder="e.g. 'I wanted comedic monologues but got dramatic ones' or 'Looking for something shorter'"
              className="text-sm min-h-[60px] resize-none"
              maxLength={500}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && negativeReason.trim()) {
                  e.preventDefault();
                  handleSubmitNegative();
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelNegative}
                className="h-7 gap-1 text-xs px-2"
              >
                <IconX className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSubmitNegative}
                disabled={!negativeReason.trim() || isSubmitting}
                className="h-7 gap-1 text-xs px-3"
              >
                <IconSend className="h-3.5 w-3.5" />
                Submit
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
