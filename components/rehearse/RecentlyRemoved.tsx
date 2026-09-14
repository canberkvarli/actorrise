"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { IconChevronDown, IconRotateClockwise } from "@tabler/icons-react";
import {
  useRecentlyRemoved,
  useRestoreMonologue,
} from "@/hooks/useRecentlyRemoved";
import { leadName } from "@/lib/collectionMeta";

/**
 * A quiet safety net at the bottom of the Collection: monologues you removed in
 * the last 30 days, each restorable with one tap. Hidden when there are none.
 *
 * Set as a stage direction rather than a heading. It is a note about the
 * shelf, not a section of it, and the only thing it should compete with is
 * nothing.
 */
export function RecentlyRemoved() {
  const { data } = useRecentlyRemoved();
  const restore = useRestoreMonologue();
  const [open, setOpen] = useState(false);

  // Array.isArray, not ?? : a non-array payload (stale cache, error body)
  // would otherwise reach .map and take the page down.
  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) return null;

  return (
    <div className="t-removed">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="t-removed__toggle"
      >
        <IconChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        (recently removed · {items.length}.)
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3.5 flex flex-col gap-2"
        >
          <ul className="flex list-none flex-col gap-2 p-0">
            {items.map((m) => (
              <li key={m.id} className="t-removed__row">
                <span className="min-w-0">
                  <span className="block truncate font-typewriter text-[15px] font-bold">
                    {leadName(m)}
                  </span>
                  <span className="block truncate font-typewriter text-xs text-[var(--t-muted-dark-2)]">
                    {m.play_title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => restore.mutate(m.id)}
                  className="t-restore"
                >
                  <IconRotateClockwise className="size-3.5" aria-hidden />
                  Restore
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 font-typewriter text-xs italic tracking-[0.06em] text-[var(--t-faint)]">
            (kept for 30 days.)
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default RecentlyRemoved;
