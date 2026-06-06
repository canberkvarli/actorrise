"use client";

import { useEffect, useState } from "react";

export type FontSize = "s" | "m" | "l" | "xl";
export type ReadingTheme = "default" | "sepia" | "dark";

export interface MemorizePrefs {
  fontSize: FontSize;
  theme: ReadingTheme;
  serif: boolean;
  /** Relaxed line spacing on the reading surface. */
  spacious: boolean;
}

const STORAGE_KEY = "actorrise.memorize.prefs";

export const DEFAULT_PREFS: MemorizePrefs = {
  fontSize: "m",
  theme: "default",
  serif: false,
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

export interface ThemeTokens {
  /** Reading surface background. */
  surface: string;
  /** Primary line text (actor's own lines). */
  ink: string;
  /** Quieter cue/partner text. */
  inkMuted: string;
  /** Faintest text — speaker labels, stage directions. */
  inkFaint: string;
  /** Hairline divider on the surface. */
  hair: string;
  /** Subtle hover wash on tappable lines. */
  hover: string;
  /** Blank-bar fill + border. */
  blankFill: string;
  blankBorder: string;
}

/**
 * Calm, editorial palettes. Default leans on the app's neutral tokens; Sepia is
 * a genuinely warm paper; Dark is a soft charcoal. Orange stays an accent only.
 */
export const THEME_TOKENS: Record<ReadingTheme, ThemeTokens> = {
  default: {
    surface: "bg-card",
    ink: "text-foreground",
    inkMuted: "text-muted-foreground",
    inkFaint: "text-muted-foreground/70",
    hair: "border-border/70",
    hover: "hover:bg-muted/50",
    blankFill: "bg-muted/50",
    blankBorder: "border-muted-foreground/40",
  },
  sepia: {
    surface: "bg-[#f5ecd8]",
    ink: "text-[#3a2f1c]",
    inkMuted: "text-[#7a6a4d]",
    inkFaint: "text-[#a08a63]",
    hair: "border-[#e0d2b4]",
    hover: "hover:bg-[#ebdfc2]",
    blankFill: "bg-[#e7d9bb]",
    blankBorder: "border-[#c4ad81]",
  },
  dark: {
    surface: "bg-[#1c1b19]",
    ink: "text-[#ece7df]",
    inkMuted: "text-[#a39d92]",
    inkFaint: "text-[#7c766c]",
    hair: "border-[#34322e]",
    hover: "hover:bg-[#272521]",
    blankFill: "bg-[#2b2926]",
    blankBorder: "border-[#4a473f]",
  },
};

export const THEME_OPTIONS: { value: ReadingTheme; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "sepia", label: "Sepia" },
  { value: "dark", label: "Dark" },
];
