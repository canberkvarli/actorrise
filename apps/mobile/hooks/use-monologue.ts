import { useQuery } from '@tanstack/react-query';
import type { Monologue } from '@actorrise/types';

import { api } from '@/lib/api';

export function useMonologue(id: number | string | undefined) {
  return useQuery<Monologue>({
    queryKey: ['monologues', String(id)],
    queryFn: ({ signal }) => api.get<Monologue>(`/api/monologues/${id}`, { signal }),
    enabled: id !== undefined && id !== null && id !== '',
  });
}
