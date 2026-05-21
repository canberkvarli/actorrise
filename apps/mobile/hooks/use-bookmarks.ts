import type { Monologue } from '@actorrise/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

const KEY = ['monologues', 'favorites', 'mine'] as const;

/**
 * Mirror of apps/web/hooks/useBookmarks. Source endpoints:
 *   GET    /api/monologues/favorites/my
 *   POST   /api/monologues/{id}/favorite       (add)
 *   DELETE /api/monologues/{id}/favorite       (remove)
 */
export function useBookmarks() {
  return useQuery<Monologue[]>({
    queryKey: KEY,
    queryFn: ({ signal }) => api.get<Monologue[]>('/api/monologues/favorites/my', { signal }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation<void, Error, { monologueId: number; nextState: boolean }>({
    mutationFn: async ({ monologueId, nextState }) => {
      if (nextState) {
        await api.post(`/api/monologues/${monologueId}/favorite`, {});
      } else {
        await api.delete(`/api/monologues/${monologueId}/favorite`);
      }
    },
    onSuccess: (_void, { monologueId, nextState }) => {
      // Optimistically patch the cached list and the detail query.
      qc.setQueryData<Monologue[]>(KEY, (prev) => {
        if (!prev) return prev;
        return nextState ? prev : prev.filter((m) => m.id !== monologueId);
      });
      qc.setQueryData(['monologues', String(monologueId)], (prev: Monologue | undefined) => {
        if (!prev) return prev;
        return { ...prev, is_favorited: nextState };
      });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
