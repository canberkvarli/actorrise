"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookmarks } from "@/hooks/useBookmarks";
import { Monologue } from "@/types/actor";
import { CollectionCard } from "@/components/rehearse/CollectionCard";

function CollectionSkeletons() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-lg" />
      ))}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Monologue[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <span className="border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((m) => (
          <CollectionCard key={m.id} monologue={m} />
        ))}
      </div>
    </section>
  );
}

export function RehearseHub() {
  const router = useRouter();
  const { data, isLoading } = useBookmarks({ alwaysFresh: true });

  const { toStudy, memorized } = useMemo(() => {
    const all = data ?? [];
    return {
      toStudy: all.filter((m) => !m.memorized),
      memorized: all.filter((m) => m.memorized),
    };
  }, [data]);

  const isEmpty = !isLoading && (data?.length ?? 0) === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-10"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Collection
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Monologues you&apos;re studying. Memorize them, then mark them off-book.
        </p>
      </div>

      {isLoading ? (
        <CollectionSkeletons />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <p className="text-base text-muted-foreground">Nothing here yet.</p>
          <Button onClick={() => router.push("/monologues")}>
            Find monologues
          </Button>
        </div>
      ) : (
        <div className="space-y-10">
          <Section title="To study" items={toStudy} />
          <Section title="Memorized" items={memorized} />
        </div>
      )}
    </motion.div>
  );
}
