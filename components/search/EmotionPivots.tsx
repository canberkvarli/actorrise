"use client";

import Link from "next/link";

/**
 * The third exit from a search that found nothing: stop typing, start
 * browsing. Six emotions, the same six the filter sheet offers, as links that
 * open the search with only that filter set. 10 of the last 23 weak searches
 * were the same phrase resubmitted; this is the move that is not "try again".
 */
export const EMOTION_PIVOTS = ["joy", "sadness", "anger", "fear", "melancholy", "hope"] as const;

export function EmotionPivots({ className = "" }: { className?: string }) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`}>
      or browse by feeling:{" "}
      {EMOTION_PIVOTS.map((emotion, i) => (
        <span key={emotion}>
          {i > 0 ? " · " : ""}
          <Link
            href={`/monologues?emotion=${emotion}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {emotion}
          </Link>
        </span>
      ))}
    </p>
  );
}
