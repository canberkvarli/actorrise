"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The wait, shown as the thing being waited for.
 *
 * This replaced `SearchCurtain`, which put a rotating cast of sketches — a
 * spotlight lamp, masks, a skull, a crown — in the middle of the page while a
 * search ran. It was a picture of a theatre standing in for the work, and at
 * the one moment the actor is most impatient it gave them something to look at
 * instead of something to read.
 *
 * Rows in the shape of the results, so the page does not jump when they land,
 * and one stage direction so the wait still speaks in the page's own voice.
 * The stop control stays: a long search must always be escapable.
 */
export function SearchWaiting({
  onStop,
  rows = 4,
}: {
  onStop?: () => void;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-5 flex items-center justify-between gap-4 sm:pl-[9.5rem]">
        <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
          (looking.)
        </p>
        {onStop && (
          <button
            type="button"
            onClick={onStop}
            className="text-sm underline underline-offset-4"
            style={{ color: "var(--t-muted-dark-2)" }}
          >
            stop
          </button>
        )}
      </div>

      <div aria-hidden className="t-results-rule mb-6" />

      <div className="space-y-8 sm:pl-[9.5rem]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ opacity: 1 - i * 0.18 }}>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
            <Skeleton className="mt-4 h-4 w-full max-w-prose" />
            <Skeleton className="mt-2 h-4 w-5/6 max-w-prose" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchWaiting;
