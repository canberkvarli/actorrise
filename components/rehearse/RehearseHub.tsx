"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmented } from "@/components/memorize/Segmented";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Monologue } from "@/types/actor";
import { CollectionRow } from "@/components/rehearse/CollectionRow";
import { RecentlyRemoved } from "@/components/rehearse/RecentlyRemoved";

type Filter = "all" | "to-study" | "memorized" | "due";

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

  const { all, toStudy, memorized, due } = useMemo(() => {
    const all = data ?? [];
    const memorized = all.filter((m) => m.memorized);
    // Spaced review: a memorized piece is "due" if it hasn't been studied in a
    // week (or never since being marked off-book), so it doesn't quietly fade.
    const DUE_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const due = memorized.filter((m) => {
      if (!m.last_studied_at) return true;
      const studied = new Date(m.last_studied_at).getTime();
      return Number.isNaN(studied) || now - studied > DUE_MS;
    });
    return {
      all,
      toStudy: all.filter((m) => !m.memorized),
      memorized,
      due,
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
    filter === "to-study"
      ? toStudy
      : filter === "memorized"
        ? memorized
        : filter === "due"
          ? due
          : all;

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
        <p className="stage-direction text-xs text-muted-foreground/70">(your repertoire.)</p>
        <h1 className="mt-2 font-sans text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
          Collection
        </h1>
        <div
          aria-hidden
          className="mt-3 h-0.5 w-12 rounded-full bg-gradient-to-r from-primary to-primary/30"
        />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your study shelf. Work through each monologue, then mark it off-book.
        </p>
      </header>

      {!showContent ? (
        <CollectionSkeletons />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
          <div className="space-y-1.5">
            <p className="stage-direction text-xs text-muted-foreground/70">
              (the shelf is bare.)
            </p>
            <p className="font-sans text-xl font-medium text-foreground">
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
              ...(due.length > 0
                ? [{ value: "due" as const, label: `Review · ${due.length}` }]
                : []),
            ]}
          />

          {filter === "due" && (
            <p className="-mt-3 text-sm text-muted-foreground">
              Memorized pieces you haven&apos;t run in a week — give them a
              refresh.
            </p>
          )}

          {/* List */}
          {visible.length === 0 ? (
            <p className="border-t border-border py-16 text-center text-sm text-muted-foreground">
              {filter === "memorized"
                ? "Nothing memorized yet. Keep going."
                : filter === "due"
                  ? "Nothing due — your memorized pieces are fresh."
                  : "Nothing to study right now."}
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              <AnimatePresence mode="popLayout" initial={false}>
                {visible.map((m: Monologue, i: number) => (
                  <CollectionRow key={m.id} monologue={m} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {showContent && <RecentlyRemoved />}
    </motion.div>
  );
}
