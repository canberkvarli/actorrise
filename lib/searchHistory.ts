import { Monologue } from "@/types/actor";

export interface SearchHistoryEntry {
  id: string;
  query: string;
  filters: {
    gender?: string;
    age_range?: string;
    emotion?: string;
    theme?: string;
    category?: string;
  };
  resultPreviews: Monologue[];
  resultCount: number;
  timestamp: number;
}

const STORAGE_KEY = "monologue_search_history_v2";
const MAX_ENTRIES = 10;

/**
 * Get all search history entries, sorted by most recent first
 */
export function getSearchHistory(): SearchHistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const entries = JSON.parse(stored) as SearchHistoryEntry[];
    return entries.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Error reading search history:", error);
    return [];
  }
}

/**
 * Add a new search to history
 * Automatically generates ID and timestamp, prunes old entries
 */
export function addSearchToHistory(
  entry: Omit<SearchHistoryEntry, "id" | "timestamp">
): void {
  try {
    const newEntry: SearchHistoryEntry = {
      ...entry,
      id: `search_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      // Store only first 3 results to minimize storage
      resultPreviews: entry.resultPreviews.slice(0, 3),
    };

    const existing = getSearchHistory();

    // Check if this exact search already exists (same query and filters)
    const isDuplicate = existing.some(
      (e) =>
        e.query === newEntry.query &&
        JSON.stringify(e.filters) === JSON.stringify(newEntry.filters)
    );

    // If duplicate, update timestamp and move to front instead of creating new entry
    let updated: SearchHistoryEntry[];
    if (isDuplicate) {
      updated = existing.filter(
        (e) =>
          e.query !== newEntry.query ||
          JSON.stringify(e.filters) !== JSON.stringify(newEntry.filters)
      );
      updated.unshift(newEntry);
    } else {
      updated = [newEntry, ...existing];
    }

    // Keep only max entries
    const pruned = updated.slice(0, MAX_ENTRIES);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (error) {
    console.error("Error saving search history:", error);
  }
}

/**
 * Remove a specific search entry by ID
 */
export function removeSearchFromHistory(id: string): void {
  try {
    const existing = getSearchHistory();
    const updated = existing.filter((entry) => entry.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("Error removing search from history:", error);
  }
}

/**
 * Restore a search entry to history
 */
export function restoreSearchToHistory(entry: SearchHistoryEntry): void {
  try {
    const existing = getSearchHistory();
    // Check if entry already exists
    const exists = existing.some((e) => e.id === entry.id);
    if (exists) return;

    // Add it back at the beginning (most recent)
    const updated = [entry, ...existing];
    // Keep only max entries
    const pruned = updated.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch (error) {
    console.error("Error restoring search to history:", error);
  }
}

/**
 * Clear all search history
 */
export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing search history:", error);
  }
}

/**
 * Get a specific search entry by ID
 */
export function getSearchById(id: string): SearchHistoryEntry | null {
  const history = getSearchHistory();
  return history.find((entry) => entry.id === id) || null;
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

/**
 * Truncate a query string to a maximum length
 */
export function truncateQuery(query: string, maxLength: number = 50): string {
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + "...";
}
