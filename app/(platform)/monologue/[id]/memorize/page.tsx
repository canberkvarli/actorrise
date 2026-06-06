"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft, IconCheck } from "@tabler/icons-react";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemorizeView } from "@/components/memorize/MemorizeView";
import { splitMonologue } from "@/lib/memorize";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useMarkStudied } from "@/hooks/useCollectionMeta";

const CONTAINER =
  "container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-3xl";

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="mb-6 text-muted-foreground hover:text-foreground">
      <IconArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}

function MarkMemorizedButton({
  monologueId,
  memorized,
}: {
  monologueId: number;
  memorized: boolean;
}) {
  const toggle = useToggleMemorized();
  // Reflect either the server value or a successful local mutation.
  const done = memorized || (toggle.isSuccess && toggle.variables?.memorized);

  return (
    <Button
      variant="outline"
      disabled={done || toggle.isPending}
      onClick={() => toggle.mutate({ monologueId, memorized: true })}
      className="mb-6"
    >
      {done ? (
        <>
          <IconCheck className="h-4 w-4" />
          Memorized
        </>
      ) : (
        "Mark as memorized"
      )}
    </Button>
  );
}

export default function MonologueMemorizePage() {
  const router = useRouter();
  const id = useParams().id as string;

  const markStudied = useMarkStudied();
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
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={CONTAINER}>
        <Skeleton className="h-9 w-24 mb-6" />
        <Skeleton className="h-9 w-3/4 mb-3" />
        <Skeleton className="h-5 w-1/2 mb-8" />
        <div className="space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !monologue) {
    return (
      <div className={CONTAINER}>
        <BackLink onClick={() => router.back()} />
        <h1 className="text-xl font-semibold">Couldn&apos;t load this monologue</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
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
    <div className={CONTAINER}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink onClick={() => router.back()} />
        <MarkMemorizedButton
          monologueId={Number(id)}
          memorized={!!monologue.memorized}
        />
      </div>
      <MemorizeView
        title={monologue.title}
        subtitle={[monologue.character_name, monologue.play_title]
          .filter(Boolean)
          .join(" · ")}
        lines={lines}
      />
    </div>
  );
}
