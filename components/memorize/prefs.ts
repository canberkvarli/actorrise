"use client";

import { useEffect, useState } from "react";

export type FontSize = "s" | "m" | "l" | "xl";
export type ReadingTheme = "default" | "sepia" | "dark";

export interface MemorizePrefs {
  fontSize: FontSize;
  theme: ReadingTheme;
  /**
   * Set the lines in the UI sans instead of the typewriter face.
   *
   * This replaces a `serif` flag whose switch was wired backwards: the reading
   * surface read `prefs.serif ? "font-sans" : ""`, so the toggle labelled
   * Serif applied the SANS face and off gave you whatever the page inherited.
   * The lines are the typewriter face now, which is what the rest of the
   * product does with monologue text; this is the way out for anyone who finds
   * a monospace hard going at length.
   */
  plainType: boolean;
  /** Relaxed line spacing on the reading surface. */
  spacious: boolean;
}

const STORAGE_KEY = "actorrise.memorize.prefs";

export const DEFAULT_PREFS: MemorizePrefs = {
  fontSize: "m",
  theme: "default",
  plainType: false,
  spacious: false,
};

function isPrefs(v: unknown): v is Partial<MemorizePrefs> {
  return typeof v === "object" && v !== null;
}

/** Reads/writes reading preferences, persisting to localStorage when available. */
export function useMemorizePrefs() {
  const [prefs, setPrefs] = useState<MemorizePrefs>(DEFAULT_PREFS);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isPrefs(parsed)) {
          setPrefs((p) => ({ ...p, ...parsed }));
        }
      }
    } catch {
      // Ignore — fall back to session/default state.
    }
  }, []);

  const update = (patch: Partial<MemorizePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal — keep session state.
      }
      return next;
    });
  };

  return { prefs, update };
}

// ── Token maps ────────────────────────────────────────────────────────────

/** Line text size, applied to actor + cue lines. */
export const FONT_SIZE_CLASS: Record<FontSize, string> = {
  s: "text-base sm:text-lg",
  m: "text-lg sm:text-xl",
  l: "text-xl sm:text-2xl",
  xl: "text-2xl sm:text-3xl",
};

export const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
];

/**
 * The three reading grounds are CSS now, on `.t-mem[data-paper]` in
 * globals.css: `default` follows the app's own light/dark, `sepia` is a warm
 * paper, `dark` is the house in blackout whichever way the app switch is set.
 * They used to be a map of Tailwind class strings for a card, which meant the
 * page around the card never changed and only the box in the middle did.
 */
export const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];
