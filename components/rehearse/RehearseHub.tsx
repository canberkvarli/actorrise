"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { toastBookmark } from "@/lib/toast";
import { Whisper } from "@/components/community/Whisper";
import { useLatestSave, useShelfOverlap } from "@/hooks/useCallboardPulse";
import { useBookmarks, useToggleFavorite } from "@/hooks/useBookmarks";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { pickCurrent } from "@/lib/collectionMeta";
import { Monologue } from "@/types/actor";
import { Bench } from "@/components/rehearse/Bench";
import { Shelf } from "@/components/rehearse/Shelf";
import { RecentlyRemoved } from "@/components/rehearse/RecentlyRemoved";

function BenchSkeleton() {
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
 * /rehearse — the piece you are working on, and the rest of the shelf.
 *
 * This was a library screen: an eyebrow, a "Collection" title, a four-segment
 * filter bar and a list of rows. The numbers say it was never a library. 70
 * actors hold a collection at all; the median is 2 pieces and 46% hold exactly
 * one. So the filter bar was routinely rendering `All · 1 / To study · 1 /
 * Memorized · 0` — three segments describing one row — above a Review tab that
 * needed a memorized piece to go stale, and there are 11 memorized pieces in
 * the entire product.
 *
 * Filtering, counting and sorting all answer "which one?". Nobody holding two
 * pieces asks that. They ask what to do with the one in front of them, so the
 * page leads with that piece at working size and says the answer once.
 */
export function RehearseHub() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The collection is client-only data; render loading until mounted so SSR
  // and the first client pass agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data, isLoading } = useBookmarks({ alwaysFresh: true });

  const mark = useToggleMemorized();
  const toggleFavorite = useToggleFavorite();

  // A cached or unexpected non-array payload would crash at .map.
  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  /* Which piece is on the bench. Defaults to the most recently touched and is
     otherwise whatever the actor picked off the shelf. Held as an id, not an
     object, so it survives the list refetching underneath it — marking a piece
     off book rewrites every row, and holding the object would put a stale copy
     on the bench. */
  const [pickedId, setPickedId] = useState<number | null>(null);
  const current = useMemo(() => {
    if (pickedId !== null) {
      const found = all.find((m) => m.id === pickedId);
      if (found) return found;
    }
    return pickCurrent(all);
  }, [all, pickedId]);

  const isEmpty = !isLoading && all.length === 0;
  const showContent = mounted && !isLoading;

  const handleRemove = (monologue: Monologue) => {
    toggleFavorite.mutate({ monologueId: monologue.id, isFavorited: true });
    queryClient.invalidateQueries({ queryKey: ["recently-removed"] });
    // Removing the piece on the bench hands the bench to the next one.
    if (pickedId === monologue.id) setPickedId(null);
    toastBookmark(false, {
      label: "Monologue",
      duration: 6000,
      onUndo: async () => {
        queryClient.setQueryData<Monologue[]>(["bookmarks"], (old) => {
          const list = old ?? [];
          return list.some((m) => m.id === monologue.id)
            ? list
            : [{ ...monologue, is_favorited: true }, ...list];
        });
        try {
          await api.post(`/api/monologues/${monologue.id}/favorite`);
        } catch {
          toast.error("Couldn't restore. Try again.");
        }
        queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
        queryClient.invalidateQueries({ queryKey: ["recently-removed"] });
      },
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {!showContent ? (
        <BenchSkeleton />
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
              Save a monologue and it&apos;ll show up here, ready to work.
            </p>
          </div>
          <Button onClick={() => router.push("/monologues")}>
            Find monologues
          </Button>
          {/* What this drawer is for, demonstrated by a real actor instead of
              explained. "Save a monologue and it'll show up here" is
              instruction; "Kylie saved Lady Bracknell's speech" is evidence
              that the shelf is a thing people actually fill. Silent when
              nobody has saved anything recently. */}
          <EmptyShelfWhisper />
        </div>
      ) : current ? (
        <>
          {/* Keyed on the id so switching pieces replays the bench's entrance
              rather than swapping text inside a static panel. */}
          <AnimatePresence mode="wait">
            <Bench
              key={current.id}
              monologue={current}
              onToggleMemorized={() =>
                mark.mutate({
                  monologueId: current.id,
                  memorized: !current.memorized,
                })
              }
              onRemove={() => handleRemove(current)}
            />
          </AnimatePresence>

          <Shelf
            items={all}
            selectedId={current.id}
            onSelect={(m) => setPickedId(m.id)}
          />
        </>
      ) : null}

      {/* The collection is the most private screen in the product: by
          definition a page containing nothing but your own things, and so the
          easiest place to feel like the only person here. This is the one
          surface where a generic "9 in the house" would be true and inert, so
          it only speaks when the house overlaps with the actor's OWN shelf. */}
      {showContent && !isEmpty && <ShelfOverlapWhisper items={all} />}

      {showContent && <RecentlyRemoved />}
    </motion.div>
  );
}

/**
 * The empty shelf's whisper.
 *
 * An empty state is where a new actor decides whether this product is alive or
 * abandoned, and ours was answering that question with instructional copy. One
 * real person having just saved one real piece settles it better than any
 * sentence beginning "Save a monologue and…".
 */
function EmptyShelfWhisper() {
  const latest = useLatestSave();
  if (!latest?.payload.title) return null;
  return (
    <Whisper
      surface="shelf_empty"
      href={
        latest.payload.monologue_id
          ? `/monologue/${latest.payload.monologue_id}`
          : "/callboard"
      }
      className="mt-1"
    >
      <span className="font-medium text-foreground/90">{latest.name}</span> just saved{" "}
      <span className="font-typewriter">{latest.payload.title}</span>
    </Whisper>
  );
}

/**
 * "K••• is reading Lady Bracknell too."
 *
 * Silent unless someone in the house has just touched a piece that is already
 * on this actor's shelf, which is rare — and the rarity is the point. A line
 * that fires every visit is a widget; one that fires occasionally is a
 * coincidence, and a coincidence about a piece you have already committed to
 * is the only fact from the feed you have a stake in.
 */
function ShelfOverlapWhisper({ items }: { items: Monologue[] }) {
  const overlap = useShelfOverlap(items.map((m) => m.id));
  if (!overlap) return null;

  const { event, monologueId } = overlap;
  const piece = items.find((m) => m.id === monologueId);
  const title = piece?.character_name || event.payload.title || "a piece you saved";
  const verb = event.event_type === "bookmarked" ? "saved" : "is reading";

  return (
    <div className="mt-8 border-t border-border/50 pt-4">
      <Whisper surface="collection" href={`/monologue/${monologueId}`}>
        <span className="font-medium text-foreground/90">{event.name}</span> {verb}{" "}
        <span className="font-typewriter">{title}</span> too
      </Whisper>
    </div>
  );
}
