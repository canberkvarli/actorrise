"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { API_URL, getAuthToken } from "@/lib/api";
import type { ScannedScene } from "@/lib/scriptMap";

/** The scan part of a scene-map answer. Same shape as `/api/scripts/scan`. */
export type SceneMapScan = {
  page_count: number;
  has_structure: boolean;
  num_acts: number;
  num_sections: number;
  show_mode_choice: boolean;
  estimated_quick_seconds: number;
  estimated_full_seconds: number;
  scenes?: ScannedScene[];
};

/** What `POST /api/scripts/{id}/scene-map` answers. No AI runs for it. */
export type SceneMapResponse =
  | { needs_file: true }
  | {
      needs_file: false;
      scan: SceneMapScan;
      built: number[];
      built_count: number;
      limit: number | null;
    };

export const sceneMapKey = (scriptId: number) => ["scene-map", scriptId] as const;

/**
 * Files handed over for scripts uploaded before the whole text was kept.
 *
 * The server reads the map from the file but does not store it until scenes
 * are built from it, so until then every read of the map, and the build
 * itself, has to send it again. Held for the tab's lifetime only: asking once
 * per visit is the promise ("you only have to do this once"), and in practice
 * the first build stores the text and the question never comes back.
 */
const keptFiles = new Map<number, File>();

export function keepScriptFile(scriptId: number, file: File) {
  keptFiles.set(scriptId, file);
}

export function keptScriptFile(scriptId: number): File | null {
  return keptFiles.get(scriptId) ?? null;
}

export async function fetchSceneMap(
  scriptId: number,
  file: File | null = keptScriptFile(scriptId),
): Promise<SceneMapResponse> {
  const token = await getAuthToken();
  if (!token) throw new Error("Please sign in again.");
  const form = new FormData();
  if (file) form.append("file", file);
  const res = await fetch(`${API_URL}/api/scripts/${scriptId}/scene-map`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Couldn't read the script");
  }
  return res.json();
}

/**
 * Every scene in an opened script, built ones marked.
 *
 * A POST because it can carry a file, but it writes nothing, so it is cached
 * like a read. Refetched when scenes are built (see `invalidateSceneMap`).
 */
export function useSceneMap(scriptId: number, enabled: boolean) {
  return useQuery<SceneMapResponse>({
    queryKey: sceneMapKey(scriptId),
    queryFn: () => fetchSceneMap(scriptId),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

export function invalidateSceneMap(queryClient: QueryClient, scriptId: number) {
  return queryClient.invalidateQueries({ queryKey: sceneMapKey(scriptId) });
}
