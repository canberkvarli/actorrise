"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api, { API_URL, getCachedAuthToken } from "@/lib/api";
import type { Audition, ParseResult } from "@/lib/auditions";

const KEY = ["auditions"] as const;

// Cached token first: getSession() takes a Web Lock and can hang behind another tab.
// The race mirrors lib/api.ts so a stuck lock becomes a retryable error, not a frozen upload.
async function token(): Promise<string | null> {
  const cached = getCachedAuthToken();
  if (cached) return cached;
  const { supabase } = await import("@/lib/supabase");
  const { data } = await Promise.race([
    supabase.auth.getSession(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Auth session lookup timed out")), 8_000)),
  ]);
  return data.session?.access_token ?? null;
}

async function multipart<T>(path: string, form: FormData): Promise<T> {
  const t = await token();
  if (!t) throw new Error("Please sign in again.");
  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof body.detail === "string" ? body.detail : "Something went wrong") as Error & { detail?: unknown; status?: number };
    err.detail = body.detail;
    err.status = res.status;
    throw err;
  }
  return body as T;
}

export function useAuditions() {
  return useQuery<Audition[]>({
    queryKey: KEY,
    queryFn: async () => (await api.get<Audition[]>("/api/auditions")).data,
    staleTime: 30_000,
  });
}

export function useNextAudition(enabled = true) {
  return useQuery<{ audition: Audition | null }>({
    queryKey: [...KEY, "next"],
    queryFn: async () => (await api.get<{ audition: Audition | null }>("/api/auditions/next")).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useParseBreakdown() {
  return useMutation({
    mutationFn: async (input: { text: string; file: File | null; tz: string }) => {
      const form = new FormData();
      if (input.text) form.append("text", input.text);
      if (input.file) form.append("file", input.file);
      form.append("tz", input.tz);
      return multipart<ParseResult>("/api/auditions/parse", form);
    },
  });
}

/** The sides go to ScenePartner exactly as its own upload does; the id comes back at once. */
export async function uploadSides(file: File): Promise<number | null> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", "full");
  try {
    const script = await multipart<{ id: number }>("/api/scripts/upload-background", form);
    return script.id;
  } catch {
    return null;
  }
}

export function useCreateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post<Audition>("/api/auditions", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      (await api.patch<Audition>(`/api/auditions/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useLogOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: "good" | "callback" | "no" }) =>
      (await api.post<Audition>(`/api/auditions/${id}/outcome`, { outcome })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => api.delete(`/api/auditions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useAddPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, monologue_id }: { id: number; monologue_id: number }) =>
      (await api.post<Audition>(`/api/auditions/${id}/pieces`, { monologue_id })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCalendarLink(enabled: boolean) {
  return useQuery<{ url: string }>({
    queryKey: [...KEY, "calendar"],
    queryFn: async () => (await api.get<{ url: string }>("/api/auditions/calendar-link")).data,
    enabled,
  });
}
