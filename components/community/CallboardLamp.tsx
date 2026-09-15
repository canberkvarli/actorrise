"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconUsers } from "@tabler/icons-react";
import { useHouseIsAwake } from "@/hooks/useCallboardPulse";
import { trackWhisperClicked } from "@/lib/analytics";

/**
 * The Callboard's place in the chrome: an icon in the utility cluster, beside
 * Help and the theme toggle.
 *
 * Not a nav tab. The nav holds the three things an actor came to DO — search,
 * ScenePartner, their shelf — and a social page put beside them either loses
 * every time or wins by stealing attention from the job.
 *
 * But it was a bare dot in that nav row first, and a dot among four icon+label
 * items reads as an item whose label failed to render. The utility cluster is
 * already icon-only, so the same control is legible there as a complete thing
 * rather than a broken one. Same idea, correct neighbourhood.
 *
 * The dot is a corner badge on the icon — the notification-bell pattern people
 * already know — and it is lit only when the house has actually been active in
 * the last six hours. A permanently lit badge is chrome and stops registering
 * within a day; one that is genuinely dark on a quiet night is worth glancing
 * at.
 */
export function CallboardLamp({ active }: { active: boolean }) {
  const { awake, actorCount } = useHouseIsAwake();

  return (
    <Link
      href="/callboard"
      onClick={() => trackWhisperClicked("nav_lamp", { awake })}
      aria-label={awake ? `The Callboard — ${actorCount} in the house` : "The Callboard"}
      title={awake ? `The Callboard — ${actorCount} in the house` : "The Callboard"}
      className="t-lamp"
      data-active={active}
      data-awake={awake}
    >
      {/* Lit only when the house has actually been active in the last six
          hours. A permanently lit badge is chrome and stops registering within
          a day; one that is genuinely dark on a quiet night is worth a glance.
          When it is dark the count goes with it, because "0 in the house" is a
          worse thing to say than nothing. */}
      <span aria-hidden className="t-lamp__bulb">
        {awake && <span className="t-lamp__breath" />}
        <span className="t-lamp__core" />
      </span>
      {awake ? <span className="tabular-nums">{actorCount}</span> : <IconUsers className="size-4" />}
    </Link>
  );
}

export function CallboardMenuRow({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) {
  const { awake, actorCount } = useHouseIsAwake();

  return (
    <Button
      asChild
      variant={active ? "default" : "ghost"}
      size="sm"
      className="w-full justify-between gap-2"
    >
      <Link
        href="/callboard"
        onClick={() => {
          trackWhisperClicked("nav_lamp", { awake, surface_variant: "mobile_menu" });
          onNavigate();
        }}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <IconUsers className="h-4 w-4" />
          The Callboard
        </div>
        {/* The count IS the reason to tap, so on mobile it is spelled out
            rather than reduced to a dot — there is room for it here, and a
            number is a far better invitation than a coloured pixel. */}
        <span className="flex min-w-[1.75rem] items-center justify-end gap-1.5">
          {awake && (
            <>
              <span aria-hidden className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              {actorCount > 0 && (
                <span className="text-xs text-muted-foreground">{actorCount}</span>
              )}
            </>
          )}
        </span>
      </Link>
    </Button>
  );
}

/**
 * The Callboard as a row in the phone sheet.
 *
 * `CallboardMenuRow` above is the old dropdown's shadcn button and stays for
 * anything still rendering that panel; this one is a plain sheet row on paper.
 * The count is spelled out rather than reduced to a dot, because on a phone
 * there is room for it and a number is a far better invitation than a coloured
 * pixel.
 */
export function CallboardSheetRow({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) {
  const { awake, actorCount } = useHouseIsAwake();

  return (
    <Link
      href="/callboard"
      className="t-sheet__row"
      data-active={active}
      onClick={() => {
        trackWhisperClicked("nav_lamp", { awake, surface_variant: "mobile_sheet" });
        onNavigate();
      }}
    >
      <IconUsers className="size-[18px] shrink-0" />
      The Callboard
      {/* Only when the house is actually awake: "0 in the house" is a worse
          thing to say than nothing. */}
      {awake && actorCount > 0 && (
        <span className="t-sheet__count">{actorCount} in the house</span>
      )}
    </Link>
  );
}
