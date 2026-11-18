import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

import { SHELF_SORTS, touchedIds, type ShelfSort } from '../rehearsal/shelf';
import { shelfOptions, latestRunOptions } from '../hooks/useScenePartner';
import { loadTouched } from './scriptTouched';

/**
 * What the Scene room's shelf is first asked with: the scripts opened on this
 * phone lately and the order chosen for the rest. Both live on the phone, and
 * both are in the shelf's query key, so the first visit used to ask the server
 * three times in a row: once with neither (the screen's first render), again
 * when the opened ones came off the disk, again when the order did. Each
 * answer landed under a different key, so the copy kept from the last visit
 * was never the one read, and the room showed its lamp until the network
 * answered. Read once here, kept in memory, the screen starts with the right
 * key and the prefetch at launch fills exactly that key.
 */
export const SHELF_SORT_KEY = 'ghostlight:sides.sort';

export type ShelfStart = { touched: Record<number, string>; sort: ShelfSort };

let known: ShelfStart | null = null;
let pending: Promise<ShelfStart> | null = null;

/** What is already known, without waiting: null only before the first read. */
export function shelfStartNow(): ShelfStart | null {
  return known;
}

export function loadShelfStart(): Promise<ShelfStart> {
  if (known) return Promise.resolve(known);
  if (!pending) {
    pending = Promise.all([
      loadTouched(),
      AsyncStorage.getItem(SHELF_SORT_KEY).catch(() => null),
    ]).then(([touched, raw]) => {
      const sort = raw && SHELF_SORTS.some((o) => o.key === raw) ? (raw as ShelfSort) : 'recent';
      // A change made while the disk was being read wins over what was on it.
      known = known ?? { touched, sort };
      return known;
    });
  }
  return pending;
}

/** The screen's own changes, kept so the next visit starts from them. */
export function rememberTouched(touched: Record<number, string>) {
  known = { touched, sort: known?.sort ?? 'recent' };
}
export function rememberSort(sort: ShelfSort) {
  known = { touched: known?.touched ?? {}, sort };
  AsyncStorage.setItem(SHELF_SORT_KEY, sort).catch(() => {});
}

/**
 * The shelf's first page and the scene that was left, fetched before the tab
 * is opened: at launch with a session on the phone, and the moment a sign-in
 * lands. Same key as the screen's, so the tab opens on the answer.
 */
export async function prefetchShelf(qc: QueryClient): Promise<void> {
  const start = await loadShelfStart();
  await Promise.all([
    qc.prefetchInfiniteQuery(shelfOptions({ q: '', genre: null, sort: start.sort, touched: touchedIds(start.touched) })),
    qc.prefetchQuery(latestRunOptions()),
  ]);
}
