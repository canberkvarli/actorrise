"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/memorize/Segmented";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Monologue } from "@/types/actor";
import { CollectionRow } from "@/components/rehearse/CollectionRow";

type Filter = "all" | "to-study" | "memorized";

function CollectionSkeletons() {
  return (
    <div className="divide-y divide-border border-t border-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-7">
          <div className="w-full max-w-md space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function RehearseHub() {
  const router = useRouter();
  // Avoid an SSR/client hydration mismatch: the collection is client-only data,
  // so render the loading state until mounted, then swap in the real content.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading } = useBookmarks({ alwaysFresh: true });

  const { all, toStudy, memorized } = useMemo(() => {
    const all = data ?? [];
    return {
      all,
      toStudy: all.filter((m) => !m.memorized),
      memorized: all.filter((m) => m.memorized),
    };
  }, [data]);

  const total = all.length;
  const memorizedCount = memorized.length;

  // Default to "To study" when there's something to study, else "All".
  const [filter, setFilter] = useState<Filter>("to-study");
  const [filterTouched, setFilterTouched] = useState(false);
  useEffect(() => {
    if (filterTouched || !mounted || isLoading) return;
    setFilter(toStudy.length > 0 ? "to-study" : "all");
  }, [filterTouched, mounted, isLoading, toStudy.length]);

  const visible =
    filter === "to-study" ? toStudy : filter === "memorized" ? memorized : all;

  const isEmpty = !isLoading && total === 0;
  const showContent = mounted && !isLoading;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-8"
    >
      {/* Header */}
      <header>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Collection
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your study shelf. Work through each monologue, then mark it off-book.
        </p>
      </header>

      {!showContent ? (
        <CollectionSkeletons />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div className="space-y-1.5">
            <p className="text-lg font-medium text-foreground">
              Nothing here yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Save a monologue and it&apos;ll show up here, ready to study.
            </p>
          </div>
          <Button onClick={() => router.push("/monologues")}>
            Find monologues
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Filter */}
          <Segmented<Filter>
            ariaLabel="Filter collection"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setFilterTouched(true);
            }}
            options={[
              { value: "all", label: `All · ${total}` },
              { value: "to-study", label: `To study · ${toStudy.length}` },
              { value: "memorized", label: `Memorized · ${memorizedCount}` },
            ]}
          />

          {/* List */}
          {visible.length === 0 ? (
            <p className="border-t border-border py-16 text-center text-sm text-muted-foreground">
              {filter === "memorized"
                ? "Nothing memorized yet. Keep going."
                : "Nothing to study right now."}
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              {visible.map((m: Monologue, i: number) => (
                <CollectionRow key={m.id} monologue={m} index={i} />
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
