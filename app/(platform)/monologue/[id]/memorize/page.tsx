"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowLeft, IconPlayerPlayFilled } from "@tabler/icons-react";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { Skeleton } from "@/components/ui/skeleton";
import { MemorizeView } from "@/components/memorize/MemorizeView";
import { splitMonologue } from "@/lib/memorize";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useMarkStudied } from "@/hooks/useCollectionMeta";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * /monologue/[id]/memorize — getting it off book.
 *
 * The screen used to open with two header rows of its own — a Back button on
 * one line, Rehearse and "Mark as memorized" on another, both in the app's
 * generic button language — and then hand off to a view that drew its OWN
 * header underneath. Three stacked heads before a word of the piece. They are
 * one head now: the way back and the way on beside the title, and off book at
 * the foot, where finishing actually happens.
 */

const SHELL =
  "theatre-tokens container relative mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8";

export default function MonologueMemorizePage() {
  const router = useRouter();
  const id = useParams().id as string;

  const markStudied = useMarkStudied();
  const queryClient = useQueryClient();
  const studiedFor = useRef<string | null>(null);
  useEffect(() => {
    const numId = Number(id);
    if (!id || Number.isNaN(numId) || studiedFor.current === id) return;
    studiedFor.current = id;
    markStudied.mutate(numId);
  }, [id, markStudied]);

  const {
    data: monologue,
    isLoading,
    isError,
    error,
  } = useQuery<Monologue>({
    queryKey: ["monologue-memorize", id],
    queryFn: async () => {
      const res = await api.get<Monologue>(`/api/monologues/${id}`);
      return res.data;
    },
    // Open instantly when coming from the Collection: the bookmarks cache already
    // holds the full monologue (incl. text). Falls back to a fetch otherwise.
    initialData: () => {
      const cached = queryClient.getQueryData<Monologue[]>(["bookmarks"]);
      return cached?.find((m) => String(m.id) === id);
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(["bookmarks"])?.dataUpdatedAt,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={`${SHELL} ${theatreFontVars}`}>
        <div aria-hidden>
          <Skeleton className="h-3 w-56 opacity-40" />
          <Skeleton className="mt-4 h-11 w-3/4 opacity-40" />
          <Skeleton className="mt-8 h-10 w-72 rounded-full opacity-40" />
          <div className="mt-10 max-w-[60ch] space-y-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full opacity-40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !monologue) {
    return (
      <div className={`${SHELL} ${theatreFontVars}`}>
        <button type="button" onClick={() => router.back()} className="t-back-to-stage mb-6">
          <IconArrowLeft className="h-3.5 w-3.5" />
          back
        </button>
        <h1 className="t-mem__title">This one wouldn&apos;t open</h1>
        <p className="t-mem__cut">
          {error instanceof Error ? error.message : "Try again in a moment."}
        </p>
      </div>
    );
  }

  const lines = splitMonologue(monologue.text).map((t) => ({
    speaker: null,
    text: t,
    mine: true,
  }));

  return (
    <div className={`${SHELL} ${theatreFontVars}`}>
      <MemorizeView
        title={monologue.title}
        subtitle={[monologue.character_name, monologue.play_title]
          .filter(Boolean)
          .join(" · ")}
        lines={lines}
        headActions={
          <>
            <button type="button" onClick={() => router.back()} className="t-mem__toggle">
              back
            </button>
            <button
              type="button"
              onClick={() => router.push(`/monologue/${id}/work`)}
              className="t-mem__toggle t-mem__toggle--go"
            >
              <IconPlayerPlayFilled className="mr-1.5 inline h-3 w-3 align-[-1px]" />
              rehearse
            </button>
          </>
        }
        footActions={
          <OffBook monologueId={Number(id)} memorized={!!monologue.memorized} />
        }
      />
    </div>
  );
}

/**
 * The point of the screen, at the foot of it.
 *
 * It was "Mark as memorized" in a generic outline button in the top-right
 * corner, above the drill rather than after it — the finish line placed at the
 * start. It is the same unlit-bulb mark the collection bench uses for a piece
 * that is known, so the two screens agree about what "off book" looks like.
 */
function OffBook({ monologueId, memorized }: { monologueId: number; memorized: boolean }) {
  const toggle = useToggleMemorized();
  const lit = memorized || (toggle.isSuccess && toggle.variables?.memorized);

  return (
    <button
      type="button"
      data-lit={lit || undefined}
      disabled={lit || toggle.isPending}
      onClick={() => toggle.mutate({ monologueId, memorized: true })}
      className="t-offbook"
    >
      <span aria-hidden className="t-offbook__bulb" />
      {lit ? "off book" : toggle.isPending ? "marking…" : "mark it off book"}
    </button>
  );
}
