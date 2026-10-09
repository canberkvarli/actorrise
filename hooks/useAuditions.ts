"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import api, { API_URL, getAuthToken } from "@/lib/api";
import type { Audition, DeletedAudition, ParseResult } from "@/lib/auditions";

const KEY = ["auditions"] as const;

async function token(): Promise<string | null> {
  return (await getAuthToken()) ?? null;
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

export function useAuditions(enabled = true) {
  return useQuery<Audition[]>({
    queryKey: KEY,
    queryFn: async () => (await api.get<Audition[]>("/api/auditions")).data,
    enabled,
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

/** The whole of an audition's sides, as text, for the reader on its page. */
type SidesText = { title: string | null; status: string | null; text: string | null };

export function useSidesText(id: number, enabled: boolean) {
  return useQuery<SidesText>({
    queryKey: [...KEY, id, "sides"],
    queryFn: async () => (await api.get<SidesText>(`/api/auditions/${id}/sides`)).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Removed in the last 30 days. */
export function useDeletedAuditions(enabled = true) {
  return useQuery<DeletedAudition[]>({
    queryKey: [...KEY, "deleted"],
    queryFn: async () => (await api.get<DeletedAudition[]>("/api/auditions/deleted")).data,
    enabled,
    staleTime: 30_000,
  });
}

export function useRestoreAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post<Audition>(`/api/auditions/${id}/restore`)).data,
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

export function useRemovePiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, piece_id }: { id: number; piece_id: number }) =>
      api.delete(`/api/auditions/${id}/pieces/${piece_id}`),
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

/** Swap one audition in the cached list for the fresh copy the server sent back. */
function useReplaceOne() {
  const qc = useQueryClient();
  return (fresh: Audition) =>
    qc.setQueryData<Audition[]>(KEY, (list) => list?.map((a) => (a.id === fresh.id ? fresh : a)));
}

/** Ask the server to make (or hand back the saved) read on the scene for one audition. */
export function useAssist() {
  const replace = useReplaceOne();
  return useMutation({
    mutationFn: async ({ id, part }: { id: number; part: "read" }) =>
      (await api.post<Audition>(`/api/auditions/${id}/assist/${part}`)).data,
    onSuccess: replace,
  });
}

export function useAskAudition() {
  const replace = useReplaceOne();
  return useMutation({
    mutationFn: async ({ id, q }: { id: number; q: string }) => (await api.post<Audition>(`/api/auditions/${id}/ask`, { q })).data,
    onSuccess: replace,
  });
}

export function useForgetAsk() {
  const replace = useReplaceOne();
  return useMutation({
    mutationFn: async ({ id, at }: { id: number; at: string }) =>
      (await api.delete<Audition>(`/api/auditions/${id}/ask?at=${encodeURIComponent(at)}`)).data,
    onSuccess: replace,
  });
}

/** The callback as its own audition. Resolves to the new one so the page can open it. */
export function useAddCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.post<Audition>(`/api/auditions/${id}/callback`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
