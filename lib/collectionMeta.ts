import type { Monologue } from "@/types/actor";

/**
 * Shared vocabulary for the collection screen.
 *
 * These lived inside CollectionRow, which is why the bench and the shelf would
 * otherwise each have grown their own copy of "how do we say 3 days ago".
 */

export function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `~${minutes} min`;
}

/** "contemporary" -> "Contemporary", "high-stakes" -> "High-stakes". */
export function titleCase(value?: string | null): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function sourceLabel(sourceType?: string | null): string | null {
  if (sourceType === "film" || sourceType === "tv") return "Film & TV";
  if (sourceType === "play") return "Play";
  return null;
}

export function lastWorkedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Worked today";
  if (days === 1) return "Worked yesterday";
  if (days < 30) return `Worked ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "Worked a month ago" : `Worked ${months} months ago`;
}

/**
 * Lead with the character, not `title`.
 *
 * Stored titles are machine-made and mostly useless — "Hamlet's speech from
 * Hamlet", "Gina's Monologue" — so two Hamlet speeches were indistinguishable
 * at a glance. Every other card in the app leads with the character.
 */
export function leadName(m: Monologue): string {
  return m.character_name?.trim() || m.title || "Untitled";
}

export function sourceLine(m: Monologue): string {
  return [m.play_title, m.author].filter(Boolean).join(" · ");
}

const COLD_MS = 7 * 24 * 60 * 60 * 1000;

/** When the piece was last touched at all — studied if ever, else saved. */
function touchedAt(m: Monologue): number {
  const studied = m.last_studied_at ? new Date(m.last_studied_at).getTime() : NaN;
  const saved = m.saved_at ? new Date(m.saved_at).getTime() : NaN;
  const values = [studied, saved].filter((n) => !Number.isNaN(n));
  return values.length ? Math.max(...values) : 0;
}

/**
 * The piece on the bench: the one most recently touched.
 *
 * `max(last_studied_at, created_at)` rather than either alone. 81% of saved
 * rows have never been studied, so studied-only would be null for four pieces
 * in five; but where the signal does exist it is real — 29 of the 32 studies
 * on record happened after the save, so it genuinely marks a return rather
 * than an artefact of saving. Taking the later of the two is defined for
 * everything and still promotes whatever you actually came back to.
 */
export function pickCurrent(list: Monologue[]): Monologue | null {
  if (!list.length) return null;
  return list.reduce((best, m) => (touchedAt(m) > touchedAt(best) ? m : best), list[0]);
}

export type BenchStateKey = "fresh" | "in-progress" | "off-book" | "cold";

export interface BenchState {
  key: BenchStateKey;
  /** The stage direction above the name. */
  direction: string;
  primary: { label: string; href: (id: number) => string };
  /** The drill, offered as a second move except when it IS the first move. */
  offerDrill: boolean;
}

/**
 * What this piece needs next.
 *
 * The old screen asked this as a filter bar — All / To study / Memorized /
 * Review — which is a question about a library. With a median collection of
 * two, the actor is not choosing between cohorts; they are looking at one
 * piece and want to know what to do with it. So the same four states are said
 * on the piece itself.
 *
 * "cold" is the only thing kept from the Review tab. That tab needed a
 * memorized piece to go stale, and there are 11 memorized pieces in the whole
 * product, so it could essentially never appear — but as a line on the piece
 * it costs nothing and means something the day it happens.
 */
export function benchState(m: Monologue): BenchState {
  const memorized = Boolean(m.memorized);
  const studied = m.last_studied_at ? new Date(m.last_studied_at).getTime() : NaN;
  const stale = Number.isNaN(studied) || Date.now() - studied > COLD_MS;

  if (memorized && stale) {
    return {
      key: "cold",
      direction: "(gone cold.)",
      primary: { label: "Warm it up", href: (id) => `/monologue/${id}/work` },
      offerDrill: true,
    };
  }
  if (memorized) {
    return {
      key: "off-book",
      direction: "(off book.)",
      primary: { label: "Run it", href: (id) => `/monologue/${id}/work` },
      offerDrill: true,
    };
  }
  if (!Number.isNaN(studied)) {
    return {
      key: "in-progress",
      direction: "(in progress.)",
      primary: { label: "Run it again", href: (id) => `/monologue/${id}/work` },
      offerDrill: true,
    };
  }
  return {
    key: "fresh",
    direction: "(on the bench.)",
    primary: { label: "Start it", href: (id) => `/monologue/${id}/work` },
    offerDrill: true,
  };
}
