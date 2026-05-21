import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { Monologue, SearchFilters, SearchResponse } from '@actorrise/types';

import { api } from '@/lib/api';

export interface UseMonologueSearchOptions {
  filters: SearchFilters;
  enabled?: boolean;
}

/**
 * Hits the same GET /api/monologues/search endpoint the web app uses.
 * Returns the full SearchResponse (results + total). Empty query returns
 * recommendations via a separate query path.
 */
export function useMonologueSearch({ filters, enabled = true }: UseMonologueSearchOptions) {
  const hasQuery = (filters.q?.trim().length ?? 0) > 0;

  return useQuery<SearchResponse>({
    queryKey: ['monologues', 'search', filters],
    queryFn: async ({ signal }) => {
      if (!hasQuery) {
        const results = await api.get<Monologue[]>('/api/monologues/recommendations?limit=20', {
          signal,
        });
        return { results, total: results.length };
      }

      return api.get<SearchResponse>('/api/monologues/search', {
        query: filtersToQuery(filters),
        signal,
        timeoutMs: 15_000,
      });
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
}

function filtersToQuery(filters: SearchFilters): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '' || value === null) continue;
    out[key] = value as string | number;
  }
  return out;
}
