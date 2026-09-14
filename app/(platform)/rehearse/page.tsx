"use client";

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RehearseHub } from "@/components/rehearse/RehearseHub";
import { theatreFontVars } from "@/lib/fonts/theatre";

/* Shaped like the bench, because that is what arrives. It used to be a title,
   a filter bar and a six-card grid — none of which the page has any more, and
   the median collection is two pieces, so it was promising six. */
function RehearseFallback() {
  return (
    <div className="t-bench">
      <div className="t-bench__grid">
        <Skeleton className="aspect-[2/3] w-[132px] shrink-0 rounded-sm bg-white/10 sm:w-[180px]" />
        <div className="w-full space-y-4">
          <Skeleton className="h-4 w-28 bg-white/10" />
          <Skeleton className="h-11 w-2/3 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
          <Skeleton className="h-24 w-full max-w-prose bg-white/10" />
          <Skeleton className="h-[60px] w-44 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

/**
 * /rehearse — the Collection: monologues the actor is studying.
 *
 * Two rooms. The piece on the bench sits on a lit ink panel; everything else
 * the actor owns sits below it in the house, on paper. `.theatre-collection`
 * carries the palette and the three faces, scoped here so no other route
 * loads the fonts or sees the tokens.
 */
export default function RehearsePage() {
  return (
    <div className={`theatre-tokens theatre-collection ${theatreFontVars}`}>
      <div className="relative isolate mx-auto w-full max-w-[1160px] px-5 py-8 sm:py-14 md:px-[14px]">
        <Suspense fallback={<RehearseFallback />}>
          <RehearseHub />
        </Suspense>
      </div>
    </div>
  );
}
