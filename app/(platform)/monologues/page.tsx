"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastBookmark } from "@/lib/toast";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SearchFiltersSheet,
  type SearchFiltersState,
} from "@/components/search/SearchFiltersSheet";
import { MonologuesHeader } from "@/components/monologues/MonologuesHeader";
import { MonologuesBrowse } from "@/components/monologues/MonologuesBrowse";
import {
  MonologuesResultsGrid,
  type SortKey,
} from "@/components/monologues/MonologuesResultsGrid";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { IconBookmark, IconX } from "@tabler/icons-react";

const EMPTY_FILTERS: SearchFiltersState = {
  gender: "",
  age_range: "",
  emotion: "",
  theme: "",
  category: "",
  tone: "",
  difficulty: "",
  author: "",
  max_duration: "",
};

function hasAnyFilter(filters: SearchFiltersState): boolean {
  return Object.values(filters).some((v) => v !== "");
}

export default function MonologuesPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Skeleton className="h-12 w-full mb-6" />
          <Skeleton className="h-96" />
        </div>
      }
    >
      <MonologuesContent />
    </Suspense>
  );
}

function MonologuesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Initial state from URL params so "See all" links can hydrate the grid.
  const initialQuery = searchParams.get("q") ?? "";
  const initialFilters: SearchFiltersState = useMemo(() => {
    const f: SearchFiltersState = { ...EMPTY_FILTERS };
    (Object.keys(EMPTY_FILTERS) as Array<keyof SearchFiltersState>).forEach(
      (k) => {
        const v = searchParams.get(k);
        if (v) f[k] = v;
      },
    );
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFiltersState>(initialFilters);
  const [maxOverdoneScore, setMaxOverdoneScore] = useState(1);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(
    null,
  );

  // Debounce-light: keep URL roughly in sync when query/filters change so
  // shareable links round-trip. Avoid pushing on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      const sp = new URLSearchParams();
      if (query.trim()) sp.set("q", query.trim());
      (
        Object.entries(filters) as Array<[keyof SearchFiltersState, string]>
      ).forEach(([k, v]) => {
        if (v) sp.set(k, v);
      });
      const qs = sp.toString();
      router.replace(qs ? `/monologues?${qs}` : "/monologues", {
        scroll: false,
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query, filters, router]);

  const trimmedQuery = query.trim();
  const filtersActive = hasAnyFilter(filters);
  const hasActiveQueryOrFilters = trimmedQuery.length > 0 || filtersActive;

  const openMonologue = (mono: Monologue) => {
    setSelectedMonologue(mono);
    api
      .get<Monologue>(`/api/monologues/${mono.id}`)
      .then((response) => setSelectedMonologue(response.data))
      .catch(() => {});
  };

  const closeMonologue = () => setSelectedMonologue(null);

  // Single source of truth for toggling favorite — mirrors /search but slimmer.
  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    const monologueId = mono.id;
    const wasFavorited = !!mono.is_favorited;

    // Optimistic update on selected card.
    if (selectedMonologue?.id === mono.id) {
      setSelectedMonologue((prev) =>
        prev
          ? {
              ...prev,
              is_favorited: !wasFavorited,
              favorite_count: wasFavorited
                ? Math.max(0, (prev.favorite_count ?? 1) - 1)
                : (prev.favorite_count ?? 0) + 1,
            }
          : null,
      );
    }

    try {
      if (wasFavorited) {
        await api.delete(`/api/monologues/${monologueId}/favorite`);
        toastBookmark(false, { label: "Monologue" });
      } else {
        await api.post(`/api/monologues/${monologueId}/favorite`);
        toastBookmark(true, { label: "Monologue" });
      }
      // Invalidate caches so curated rows + bookmarks update.
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["monologues", "search"] });
      queryClient.invalidateQueries({ queryKey: ["monologues", "curated"] });
    } catch (err) {
      // Revert on failure.
      if (selectedMonologue?.id === mono.id) {
        setSelectedMonologue((prev) =>
          prev ? { ...prev, is_favorited: wasFavorited } : null,
        );
      }
      toast.error("Couldn't update bookmark. Please try again.");
      console.error(err);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 sm:py-10 max-w-3xl">
      <MonologuesHeader
        query={query}
        setQuery={setQuery}
        filters={filters}
        setFilters={setFilters}
        onOpenFiltersSheet={() => setShowFiltersSheet(true)}
        hasActiveFilters={filtersActive}
      />

      <div className="mt-8">
        {hasActiveQueryOrFilters ? (
          <MonologuesResultsGrid
            query={trimmedQuery}
            filters={filters}
            sort={sort}
            setSort={setSort}
            onSelect={openMonologue}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          <MonologuesBrowse
            onSelect={openMonologue}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </div>

      <SearchFiltersSheet
        open={showFiltersSheet}
        onOpenChange={setShowFiltersSheet}
        filters={filters}
        setFilters={setFilters}
        maxOverdoneScore={maxOverdoneScore}
        setMaxOverdoneScore={setMaxOverdoneScore}
      />

      {/* Lightweight detail modal — clicking a card opens the existing
          MonologueDetailContent inside an overlay. Read/download/etc.
          remain available via the detail component's own controls. */}
      <AnimatePresence>
        {selectedMonologue && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[1000] bg-background/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
            onClick={closeMonologue}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-3xl my-8 bg-card border rounded-xl shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-border/60 bg-card/95 backdrop-blur px-4 py-2.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => toggleFavorite(e, selectedMonologue)}
                  className="h-9 w-9"
                  aria-label={
                    selectedMonologue.is_favorited
                      ? "Remove bookmark"
                      : "Bookmark monologue"
                  }
                >
                  <IconBookmark
                    className={`h-5 w-5 ${
                      selectedMonologue.is_favorited
                        ? "fill-[#CB4B00] text-[#CB4B00]"
                        : ""
                    }`}
                  />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeMonologue}
                  className="h-9 w-9"
                  aria-label="Close"
                >
                  <IconX className="h-5 w-5" />
                </Button>
              </div>
              <div className="p-6">
                <MonologueDetailContent monologue={selectedMonologue} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
