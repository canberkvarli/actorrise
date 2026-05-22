import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';

export interface ActorProfile {
  name?: string;
  age_range?: string;
  gender?: string;
  ethnicity?: string;
  height?: string;
  build?: string;
  location?: string;
  experience_level?: string;
  type?: string[];
  training_background?: string;
  union_status?: string;
  preferred_genres?: string[];
  overdone_alert_sensitivity?: number;
  profile_bias_enabled?: boolean;
  headshot_url?: string;
}

const KEY = ['profile', 'me'] as const;

export function useProfile() {
  return useQuery<ActorProfile | null>({
    queryKey: KEY,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<ActorProfile>('/api/profile', { signal });
      } catch (e) {
        // 404 means profile not yet created — return empty
        if (e instanceof Error && /404/.test(e.message)) return null;
        throw e;
      }
    },
  });
}

export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation<ActorProfile, Error, { profile: ActorProfile; isNew: boolean }>({
    mutationFn: ({ profile, isNew }) =>
      isNew
        ? api.post<ActorProfile>('/api/profile', profile)
        : api.request<ActorProfile>({ path: '/api/profile', method: 'PUT', body: profile }),
    onSuccess: (saved) => {
      qc.setQueryData(KEY, saved);
    },
  });
}
