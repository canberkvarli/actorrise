"use client";

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RehearseHub } from "@/components/rehearse/RehearseHub";

function RehearseFallback() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * /rehearse — the Collection: monologues the actor is studying.
 */
export default function RehearsePage() {
  return (
    <div className="relative isolate container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      {/* Soft warm glow up top — a radial wash that fades out on every side, so
          it blends in instead of reading as a hard-edged rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_72%)]"
      />
      <Suspense fallback={<RehearseFallback />}>
        <RehearseHub />
      </Suspense>
    </div>
  );
}
