import { getMonologue } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { getOffline } from './offline';

/**
 * The words of a piece: the phone's own copy first (instant for anything in
 * the Book), then the server. The tape room and the Tape page share it under
 * the query key ['monologue', id], so the page warms the room.
 */
export async function loadPiece(id: string): Promise<Monologue> {
  const local = await getOffline(id).catch(() => null);
  if (local?.fullText) return local;
  try {
    return apiToMonologue(await getMonologue(id));
  } catch (err) {
    if (local) return local;
    throw err;
  }
}
