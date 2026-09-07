"use client";

import Link from "next/link";
import { useHouseIsAwake } from "@/hooks/useCallboardPulse";

/**
 * The Callboard's nav presence: a lit lamp, not a tab.
 *
 * The board had exactly one entry point in the whole app before this. The
 * obvious fix is a fifth nav item, and it is the wrong one — the nav holds the
 * three things an actor came to DO (search, rehearse, their shelf), and a
 * social page put beside them either loses every time or wins by stealing
 * attention from the job. It is also the kind of page nobody navigates to
 * deliberately; you go because you can see something is happening.
 *
 * So it gets a lamp. Lit and pulsing when the house has been active in the last
 * six hours, dark otherwise — which is honest, and means the dot is worth
 * looking at rather than being permanent chrome that stops registering. The
 * count rides along on wide screens only.
 */
export function CallboardLamp({ active }: { active: boolean }) {
  const { awake, actorCount } = useHouseIsAwake();

  return (
    <Link
      href="/callboard"
      aria-label={
        awake
          ? `The Callboard — ${actorCount} in the house`
          : "The Callboard"
      }
      title="The Callboard"
      className={`group relative flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs transition-colors lg:text-sm ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        {awake && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            awake ? "bg-primary" : "bg-muted-foreground/40"
          }`}
        />
      </span>
      {/* The number, where there is room for it. On a narrow window the lamp
          alone carries the whole message, so the count is the first thing to
          go rather than something that wraps the nav. */}
      {awake && actorCount > 0 && (
        <span className="hidden font-typewriter text-[11px] tabular-nums xl:inline">
          {actorCount}
        </span>
      )}
    </Link>
  );
}
