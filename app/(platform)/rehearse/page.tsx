"use client";

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RehearseHub } from "@/components/rehearse/RehearseHub";

function RehearseFallback() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-9 w-72 rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * /rehearse — the hub for rehearsing scenes and monologues.
 * Tabs (Scenes | Monologues | Saved) are URL-synced via ?tab=.
 */
export default function RehearsePage() {
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      <Suspense fallback={<RehearseFallback />}>
        <RehearseHub />
      </Suspense>
    </div>
  );
}
