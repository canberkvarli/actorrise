import type { Scene, UserScript } from '@actorrise/types';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useScripts() {
  return useQuery<UserScript[]>({
    queryKey: ['scripts'],
    queryFn: ({ signal }) => api.get<UserScript[]>('/api/scripts/', { signal }),
  });
}

export function useScript(id: number | string | undefined) {
  return useQuery<UserScript>({
    queryKey: ['scripts', String(id)],
    queryFn: ({ signal }) => api.get<UserScript>(`/api/scripts/${id}`, { signal }),
    enabled: id !== undefined && id !== null && id !== '',
  });
}

export function useScene(id: number | string | undefined) {
  return useQuery<Scene>({
    queryKey: ['scenes', String(id)],
    queryFn: ({ signal }) => api.get<Scene>(`/api/scenes/${id}`, { signal }),
    enabled: id !== undefined && id !== null && id !== '',
  });
}
