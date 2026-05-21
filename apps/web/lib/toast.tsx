"use client";

import { useState } from "react";
import { toast } from "sonner";
import { IconBookmark, IconBookmarkOff, IconX } from "@tabler/icons-react";
import api from "@/lib/api";

const BOOKMARK_TOAST_CLASS = "actorrise-toast-bookmark";
const DEFAULT_DURATION_MS = 5000;

export interface ToastBookmarkOptions {
  /** Toast visible duration in ms. Default 5000 when onUndo is provided, else default Sonner. */
  duration?: number;
  /** When provided, shows an "Undo" action that calls this (reverts the bookmark change). */
  onUndo?: () => void;
  /** Content type label for the toast, e.g. "Monologue", "Movie", "TV show". Shown as "{Label} added/removed from saved". */
  label?: string;
}

/**
 * Show the redesigned bookmark toast (added / removed from saved).
 * Optionally show Undo, longer duration, and a content label (Monologue, Movie, TV show).
 */
export function toastBookmark(added: boolean, options?: ToastBookmarkOptions) {
  const { duration = options?.onUndo ? DEFAULT_DURATION_MS : undefined, onUndo, label } = options ?? {};
  const title = label
    ? (added ? `${label} added to saved` : `${label} removed from saved`)
    : (added ? "Added to saved" : "Removed from saved");
  const description = added ? "Find it in Saved" : undefined;
  const icon = added ? (
    <IconBookmark className="h-4 w-4 fill-current" />
  ) : (
    <IconBookmarkOff className="h-4 w-4" />
  );
  toast.success(title, {
    description,
    icon,
    className: BOOKMARK_TOAST_CLASS,
    ...(onUndo !== undefined && {
      duration: duration ?? DEFAULT_DURATION_MS,
      action: {
        label: "Undo",
        onClick: () => onUndo(),
      },
    }),
  });
}

/* ── Script source feedback toast ─────────────────────────────── */

const SCRIPT_FEEDBACK_TOAST_ID = "script-feedback";

function ScriptFeedbackToast({ toastId, source, title }: { toastId: string | number; source: string; title: string }) {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (rating: "positive" | "negative", text?: string) => {
    api
      .post("/api/feedback", {
        context: "script_source",
        rating,
        ...(text ? { comment: text } : {}),
      })
      .catch(() => {});
    setSent(true);
    setTimeout(() => toast.dismiss(toastId), 1200);
  };

  if (sent) {
    return (
      <div className="w-[340px] rounded-lg border border-border bg-background p-4 shadow-lg text-sm text-foreground">
        Thanks for the feedback!
      </div>
    );
  }

  return (
    <div className="w-[340px] rounded-lg border border-border bg-background p-4 shadow-lg text-sm text-foreground relative">
      <button
        type="button"
        onClick={() => toast.dismiss(toastId)}
        className="absolute top-2 right-2 p-1 rounded-sm opacity-50 hover:opacity-100 transition-opacity"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
      <p className="font-medium pr-6 mb-3">
        Did you find the script for <span className="text-primary">{title}</span>?
      </p>
      {!showComment ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit("positive")}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => setShowComment(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-border hover:bg-muted transition-colors"
          >
            No
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What went wrong? (optional)"
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <button
            type="button"
            onClick={() => submit("negative", comment || undefined)}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

export function toastScriptFeedback(source: string, title: string) {
  toast.custom(
    (toastId) => <ScriptFeedbackToast toastId={toastId} source={source} title={title} />,
    { id: SCRIPT_FEEDBACK_TOAST_ID, duration: 15000, position: "top-center" },
  );
}
