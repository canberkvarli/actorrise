"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import type { SearchFiltersState } from "@/components/search/SearchFiltersSheet";

interface MonologuesResultsGridProps {
  query: string;
  filters: SearchFiltersState;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  onSelect: (mono: Monologue) => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
}

export type SortKey = "relevance" | "length" | "recent";

type SearchResponse = {
  results: Monologue[];
  total: number;
};

function buildSearchParams(
  query: string,
  filters: SearchFiltersState,
): URLSearchParams {
  const params = new URLSearchParams({
    limit: "24",
    page: "1",
    source_type: "play",
  });
  if (query.trim()) params.set("q", query.trim());
  (Object.entries(filters) as Array<[keyof SearchFiltersState, string]>).forEach(
    ([key, value]) => {
      if (value) params.append(key, value);
    },
  );
  return params;
}

function sortMonologues(results: Monologue[], sort: SortKey): Monologue[] {
  if (sort === "relevance") return results;
  if (sort === "length") {
    return [...results].sort(
      (a, b) =>
        (a.estimated_duration_seconds ?? 0) -
        (b.estimated_duration_seconds ?? 0),
    );
  }
  // "recent" — sort by id desc as a stand-in for created_at (newer rows
  // get higher autoincrement ids in the monologues table).
  return [...results].sort((a, b) => b.id - a.id);
}

export function MonologuesResultsGrid({
  query,
  filters,
  sort,
  setSort,
  onSelect,
  onToggleFavorite,
}: MonologuesResultsGridProps) {
  const params = useMemo(
    () => buildSearchParams(query, filters),
    [query, filters],
  );

  const { data, isLoading, isError } = useQuery<SearchResponse>({
    queryKey: ["monologues", "search", params.toString()],
    queryFn: async () => {
      const res = await api.get<SearchResponse>(
        `/api/monologues/search?${params.toString()}`,
        { timeoutMs: 180000 },
      );
      return res.data;
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const results = useMemo(
    () => sortMonologues(data?.results ?? [], sort),
    [data?.results, sort],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading ? (
            "Searching..."
          ) : (
            <>
              <span className="tabular-nums font-medium text-foreground">
                {data?.total ?? results.length}
              </span>{" "}
              {(data?.total ?? results.length) === 1 ? "result" : "results"}
            </>
          )}
        </p>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[170px] h-9 text-sm">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="relevance">Relevance</SelectItem>
            <SelectItem value="length">Length</SelectItem>
            <SelectItem value="recent">Recently added</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong loading results. Try again in a moment.
          </p>
        </div>
      ) : results.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No monologues match. Try widening filters, or{" "}
            <Link
              href="/submit-monologue"
              className="text-foreground underline underline-offset-2 hover:text-[#CB4B00]"
            >
              contribute
            </Link>{" "}
            one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((mono, idx) => (
            <MonologueResultCard
              key={mono.id}
              mono={mono}
              index={idx}
              onSelect={() => onSelect(mono)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  );
}
