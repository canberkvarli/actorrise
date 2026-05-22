import type { RehearsalSession } from '@actorrise/types';
import { useMutation } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useStartRehearsal() {
  return useMutation<RehearsalSession, Error, { scene_id: number | string; user_character: string }>({
    mutationFn: (vars) => api.post<RehearsalSession>('/api/scenes/rehearse/start', vars),
  });
}

export function useDeliverLine() {
  return useMutation<
    { session_status?: string; lines_remaining?: number | null },
    Error,
    { session_id: number; user_input: string; request_feedback?: boolean }
  >({
    mutationFn: (vars) => api.post('/api/scenes/rehearse/deliver', vars),
  });
}

export function useAbandonRehearsal() {
  return useMutation<void, Error, { session_id: number }>({
    mutationFn: ({ session_id }) =>
      api.post(`/api/scenes/rehearse/${session_id}/abandon`, {}),
  });
}
