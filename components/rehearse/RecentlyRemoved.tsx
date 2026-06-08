"use client";

import { useState } from "react";
import { IconChevronDown, IconRotateClockwise } from "@tabler/icons-react";
import {
  useRecentlyRemoved,
  useRestoreMonologue,
} from "@/hooks/useRecentlyRemoved";

/**
 * A quiet safety net at the bottom of the Collection: monologues you removed in
 * the last 30 days, each restorable with one tap. Hidden when there are none.
 */
export function RecentlyRemoved() {
  const { data } = useRecentlyRemoved();
  const restore = useRestoreMonologue();
  const [open, setOpen] = useState(false);

  const items = data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <IconChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        Recently removed ({items.length})
      </button>

      {open && (
        <>
          <ul className="mt-4 space-y-3">
            {items.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {m.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[m.character_name, m.play_title].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore.mutate(m.id)}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground underline-offset-4 transition-colors hover:underline"
                >
                  <IconRotateClockwise className="size-3.5" aria-hidden />
                  Restore
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Removed monologues are kept here for 30 days.
          </p>
        </>
      )}
    </div>
  );
}

export default RecentlyRemoved;
