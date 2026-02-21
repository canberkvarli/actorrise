"use client";

import { toast } from "sonner";
import { IconBookmark, IconBookmarkOff } from "@tabler/icons-react";

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
