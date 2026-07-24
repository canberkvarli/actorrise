"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export interface RoomLine {
  line_order: number;
  character_name: string;
  text: string;
}

export interface RoomScene {
  id: number;
  title: string;
  character_1_name: string;
  character_2_name: string;
  line_count: number;
  lines: RoomLine[];
}

export interface CommunityScriptDetail {
  id: number;
  title: string;
  author: string;
  owner_name: string;
  is_demo: boolean;
  scenes: RoomScene[];
}

// A shared (or demo) script with its scenes + lines — the content a rehearsal
// room runs. Public read (only shared/demo scripts resolve).
export function useCommunityScript(scriptId: number | null) {
  return useQuery<CommunityScriptDetail>({
    queryKey: ["community-script", scriptId],
    queryFn: async () => {
      const res = await api.get<CommunityScriptDetail>(`/api/community/scripts/${scriptId}`);
      return res.data;
    },
    enabled: scriptId !== null,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
