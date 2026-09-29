/**
 * One ask on screen at a time.
 *
 * Every ask is its own useTrialOffer, and the strips all pin to the same place
 * at the foot of the screen. Two of them going live together (the third save,
 * made on a page already counting down free reads) would draw one on top of the
 * other. The first to want the screen holds it until it lets go.
 *
 * A module-level store read through useSyncExternalStore, so nothing sets state
 * from an effect to find out who holds it.
 */

let current: string | null = null;
const listeners = new Set<() => void>();

const changed = () => listeners.forEach((listener) => listener());

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function holder(): string | null {
  return current;
}

/** True if `id` holds the slot after the call. */
export function claim(id: string): boolean {
  if (current === null) {
    current = id;
    changed();
  }
  return current === id;
}

export function release(id: string): void {
  if (current !== id) return;
  current = null;
  changed();
}
