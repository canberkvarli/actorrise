"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookmarks } from "@/hooks/useBookmarks";
import { MonologueCard } from "@/components/rehearse/MonologueCard";

export function MonologuesTab() {
  const { data: monologues, isLoading } = useBookmarks();
  const saved = monologues ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Saved monologues</h2>
          {saved.length === 0 && !isLoading && (
            <p className="mt-1 text-sm text-muted-foreground">
              You haven&apos;t saved any monologues yet. Browse the library to find one to rehearse.
            </p>
          )}
        </div>
        <Button asChild>
          <Link href="/monologues">Browse all monologues</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : saved.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {saved.map((m) => (
            <MonologueCard key={m.id} monologue={m} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
