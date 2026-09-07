"use client";

import Link from "next/link";
import { IconUsers } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
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
    <Button
      asChild
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className="relative h-9 w-9"
    >
      <Link
        href="/callboard"
        onClick={() => trackWhisperClicked("nav_lamp", { awake })}
        aria-label={
          awake
            ? `The Callboard — ${actorCount} in the house`
            : "The Callboard"
        }
        title={awake ? `The Callboard — ${actorCount} in the house` : "The Callboard"}
      >
        <IconUsers className="h-4 w-4" />
        {awake && (
          <span
            aria-hidden
            /* Tucked to the icon's top-right rather than centred under it, so
               it reads as a badge ON the icon instead of a second element
               sharing the button. */
            className="absolute right-1.5 top-1.5 flex h-2 w-2"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          </span>
        )}
        <span className="sr-only">The Callboard</span>
      </Link>
    </Button>
  );
}

/**
 * The same thing as a row in the mobile hamburger.
 *
 * The lamp lives in a desktop-only cluster, so on a phone the board had no
 * persistent handle at all — only the whispers, which are contextual and
 * therefore easy to miss if you never hit the surface carrying one. The
 * hamburger is where this app already keeps its secondary destinations, and a
 * row there gets what the desktop icon cannot: a name.
 */
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
