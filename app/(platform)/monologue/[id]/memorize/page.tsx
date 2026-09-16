"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconBulb,
  IconBulbFilled,
  IconPlayerPlay,
} from "@tabler/icons-react";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { Skeleton } from "@/components/ui/skeleton";
import { MemorizeView } from "@/components/memorize/MemorizeView";
import { splitMonologue } from "@/lib/memorize";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useToggleMemorized } from "@/hooks/useMemorized";
import { useMarkStudied } from "@/hooks/useCollectionMeta";

/**
 * The memorize room.
 *
 * It was the one screen reached FROM a piece that did not look like one: a
 * shadcn container, a ghost "Back", a bold sans heading and two grey pills,
 * while the page it came from is set in Playfair on cream with a hard shadow
 * under everything. Same tokens as /monologue/[id] now — the scope class, the
 * three faces, the head, the way back — and the controls inside MemorizeView
 * wear the working bar's language (`chrome="theatre"`).
 *
 * What is deliberately NOT restyled: the reading surface itself. Default,
 * sepia and dark are the actor's own choice, stored per browser, and a
 * redesign does not get to take back the one part of a screen someone set for
 * themselves.
 */
const SHELL =
  "theatre-monologue theatre-tokens t-m__body min-h-screen pb-32 lg:pb-20";
const COLUMN = "mx-auto w-full max-w-[860px] px-5 pt-8 sm:px-6 sm:pt-12";

function BackToPiece({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="t-mem__back">
      <IconArrowLeft className="h-3.5 w-3.5" />
      back to the piece
    </button>
  );
}

/**
 * Off book, from inside the drill.
 *
 * One way only, on purpose: this is the room where you learn it, so the claim
 * worth making here is "I have it". Unmarking belongs on the piece, beside
 * everything else that is true about it.
 */
function OffBookButton({
  monologueId,
  memorized,
}: {
  monologueId: number;
  memorized: boolean;
}) {
  const toggle = useToggleMemorized();
  const done = memorized || (toggle.isSuccess && toggle.variables?.memorized);

  return (
    <button
      type="button"
      disabled={done || toggle.isPending}
      onClick={() => toggle.mutate({ monologueId, memorized: true })}
      className="t-m-drill inline-flex h-12 items-center justify-center gap-2.5 rounded-full border-[1.5px] px-5 text-[14px] font-bold transition-all duration-300 disabled:cursor-default"
      style={
        done
          ? { borderColor: "var(--t-orange-deep)", color: "var(--t-orange-deep)" }
          : undefined
      }
    >
      {done ? (
        <>
          <IconBulbFilled className="h-[18px] w-[18px]" />
          Off book
        </>
      ) : (
        <>
          <IconBulb className="h-[18px] w-[18px]" />
          Mark it off book
        </>
      )}
    </button>
  );
}

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
        <div className={COLUMN}>
          {/* Shaped like the room it is holding, so nothing jumps when the
              piece lands: the way back, the head, the bar, the page. */}
          <Skeleton className="h-4 w-32 opacity-40" />
          <Skeleton className="mt-7 h-3 w-24 opacity-40" />
          <Skeleton className="mt-3 h-11 w-3/4 opacity-40" />
          <Skeleton className="mt-3 h-4 w-1/2 opacity-40" />
          <Skeleton className="mt-8 h-14 w-full rounded-full opacity-40" />
          <div className="mt-7 space-y-5">
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
        <div className={COLUMN}>
          <BackToPiece onClick={() => router.back()} />
          <p className="t-m__dir mt-8 text-[12px]" style={{ color: "var(--t-faint)" }}>
            (nothing came back.)
          </p>
          <h1 className="t-m__display m-0 mt-2 text-[34px] leading-[1.05]">
            I couldn&apos;t open this one.
          </h1>
          <p className="mt-3 text-[15px]" style={{ color: "var(--t-muted-dark)" }}>
            {error instanceof Error ? error.message : "Try it again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  const lines = splitMonologue(monologue.text).map((t) => ({
    speaker: null,
    text: t,
    mine: true,
  }));

  const attribution = [monologue.character_name, monologue.play_title]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={`${SHELL} ${theatreFontVars}`}>
      <div className={COLUMN}>
        <BackToPiece onClick={() => router.back()} />

        {/* The head. Not the one-sheet — you have already met this piece, and
            a full poster between you and the lines you are here to learn is a
            wall. A slug, the title, who says it, and then the work. */}
        <header className="t-m-rise mt-7">
          <p className="t-m__dir m-0 text-[12px]" style={{ color: "var(--t-faint)" }}>
            (line by line.)
          </p>
          <h1 className="t-m__display m-0 mt-2 text-[34px] leading-[1.05] sm:text-[44px]">
            {monologue.title}
          </h1>
          {attribution && (
            <p
              className="t-m__mono m-0 mt-2.5 text-[12px] uppercase tracking-[0.16em]"
              style={{ color: "var(--t-muted-dark-2)" }}
            >
              {attribution}
            </p>
          )}
        </header>

        {/* The two ways on from here, told apart by weight: run it with a
            partner, or claim it. Both were plain shadcn buttons stacked above
            a "Back" ghost, which made the way OUT of the room the loudest
            thing in it. */}
        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => router.push(`/monologue/${id}/work`)}
            className="inline-flex h-12 items-center justify-between gap-3 rounded-full pl-6 pr-2 text-[15px] font-bold transition-transform duration-300 hover:scale-[1.03] hover:-rotate-1"
            style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
          >
            Rehearse this
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full"
              style={{
                background: "var(--t-cta-dot-bg)",
                color: "var(--t-cta-dot-fg)",
              }}
            >
              <IconPlayerPlay className="h-4 w-4 fill-current" />
            </span>
          </button>

          <OffBookButton
            monologueId={Number(id)}
            memorized={!!monologue.memorized}
          />
        </div>

        <div className="mt-9">
          <MemorizeView
            chrome="theatre"
            title={monologue.title}
            subtitle={attribution}
            lines={lines}
          />
        </div>
      </div>
    </div>
  );
}
