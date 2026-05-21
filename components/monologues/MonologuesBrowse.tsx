"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { useBookmarks } from "@/hooks/useBookmarks";
import { CuratedRow } from "@/components/monologues/CuratedRow";

interface MonologuesBrowseProps {
  onSelect: (mono: Monologue) => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
}

type SearchResponse = {
  results: Monologue[];
  total: number;
};

/**
 * Curated row spec — title, the search-API params that drive it, and the
 * URL the "See all" link points to (we hydrate `/monologues` with the same
 * params so the results grid takes over).
 */
type CuratedSpec = {
  key: string;
  title: string;
  params: Record<string, string>;
  seeAllHref: string;
};

const CURATED_ROWS: CuratedSpec[] = [
  {
    key: "dramatic",
    title: "Dramatic",
    // No direct tone filter on the API — `q="dramatic"` lets the
    // backend query optimizer map it to tone=dramatic.
    params: { q: "dramatic", limit: "6", source_type: "play" },
    seeAllHref: "/monologues?q=dramatic",
  },
  {
    key: "contemporary-short",
    title: "Contemporary under 2 minutes",
    params: { category: "contemporary", max_duration: "120", limit: "6", source_type: "play" },
    seeAllHref: "/monologues?category=contemporary&max_duration=120",
  },
  {
    key: "classical",
    title: "Classical",
    params: { category: "classical", limit: "6", source_type: "play" },
    seeAllHref: "/monologues?category=classical",
  },
  {
    key: "recently-added",
    title: "Recently added",
    // No `q` -> discover endpoint. Backend default order surfaces fresh
    // overdone-asc + favorite-desc; we accept that as a stand-in for
    // "recently added" since the API doesn't expose created_at sort.
    params: { limit: "6", source_type: "play" },
    seeAllHref: "/monologues",
  },
];

function buildSearchUrl(params: Record<string, string>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v);
  });
  return `/api/monologues/search?${sp.toString()}`;
}

function useCuratedMonologues(spec: CuratedSpec) {
  return useQuery<Monologue[]>({
    queryKey: ["monologues", "curated", spec.key, spec.params],
    queryFn: async () => {
      const res = await api.get<SearchResponse>(buildSearchUrl(spec.params), { timeoutMs: 30000 });
      return res.data.results ?? [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Stacked curated rows. "Recently saved" is hydrated from the cached
 * bookmarks query (shared with /my-monologues) so visits feel instant.
 */
export function MonologuesBrowse({ onSelect, onToggleFavorite }: MonologuesBrowseProps) {
  const { data: bookmarks = [], isLoading: isBookmarksLoading } = useBookmarks();
  const recentlySaved = bookmarks.slice(0, 6);

  // One useQuery per row keeps caches independent and parallelises requests.
  const dramatic = useCuratedMonologues(CURATED_ROWS[0]);
  const contemporary = useCuratedMonologues(CURATED_ROWS[1]);
  const classical = useCuratedMonologues(CURATED_ROWS[2]);
  const recentlyAdded = useCuratedMonologues(CURATED_ROWS[3]);

  const queries = [dramatic, contemporary, classical, recentlyAdded];

  return (
    <div className="space-y-10">
      <CuratedRow
        title="Recently saved"
        monologues={recentlySaved}
        seeAllHref="/my-monologues"
        isLoading={isBookmarksLoading}
        onSelect={onSelect}
        onToggleFavorite={onToggleFavorite}
      />
      {CURATED_ROWS.map((spec, i) => (
        <CuratedRow
          key={spec.key}
          title={spec.title}
          monologues={queries[i].data ?? []}
          seeAllHref={spec.seeAllHref}
          isLoading={queries[i].isLoading}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
