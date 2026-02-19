export const CHANGELOG_STORAGE_KEY = "last_seen_feature_id";

export type ChangelogCategory = "feature" | "improvement" | "fix";

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  emoji?: string;
  description: string;
  category: ChangelogCategory;
  show_modal: boolean;
  cta_text?: string;
  cta_link?: string;
  image_url?: string | null;
}

export interface ChangelogData {
  updates: ChangelogEntry[];
}

/**
 * Returns the first (newest) entry in updates that has show_modal === true.
 * Assumes updates are ordered newest-first.
 */
export function getLatestModalEntry(updates: ChangelogEntry[]): ChangelogEntry | null {
  if (!Array.isArray(updates)) return null;
  return updates.find((e) => e.show_modal === true) ?? null;
}

/**
 * Reads last seen feature id from localStorage. Safe for SSR (returns null).
 */
export function getLastSeenId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CHANGELOG_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Persists the given feature id so the modal won't show again for that feature.
 */
export function markAsSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

/**
 * Clears the last seen feature id (for testing the modal).
 */
export function clearLastSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CHANGELOG_STORAGE_KEY);
  } catch {
    // ignore
  }
}
