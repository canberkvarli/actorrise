"use client";

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RehearseHub } from "@/components/rehearse/RehearseHub";

/* Shaped like the bench, because that is what arrives. It used to be a title,
   a filter bar and a six-card grid — none of which the page has any more, and
   the median collection is two pieces, so it was promising six. */
function RehearseFallback() {
  return (
    <div className="rounded-2xl border border-border px-5 py-7 sm:px-9 sm:py-10">
      <div className="flex flex-col gap-6 sm:flex-row sm:gap-9">
        <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-sm sm:w-44" />
        <div className="w-full space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full max-w-prose" />
          <Skeleton className="h-11 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * /rehearse — the Collection: monologues the actor is studying.
 */
export default function RehearsePage() {
  return (
    /* The page-level radial wash is gone: the bench is a lit panel now and
       brings its own bloom, so a second glow sat behind an opaque surface
       doing nothing but tinting the margins around it. */
    <div className="relative isolate container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      <Suspense fallback={<RehearseFallback />}>
        <RehearseHub />
      </Suspense>
    </div>
  );
}
