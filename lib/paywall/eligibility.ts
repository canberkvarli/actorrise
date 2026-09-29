/**
 * When a price may be shown. Pure: the caller owns the clock and the storage.
 *
 * Replaces the single counter that lived in TrialOffer.tsx: 4 shows ever and 48
 * hours between any two, shared by every trigger. Under it a scene-finished ask
 * on Monday silenced the monologue ask on Tuesday, and in the first two days
 * anything counted them, 9 people saw a price.
 *
 * The rules:
 *   - a gate shows at most once in 24 hours
 *   - a dismissed gate stays quiet for 7 days
 *   - a gate stops for good after 4 shows
 *   - 3 dismissals in one browser session silence every gate for that session
 *   - a click on any price's button silences every gate: they are in the flow
 */

export type GateState = { shows: number; lastShownAt: number; quietUntil: number };
export type Store = { gates: Record<string, GateState>; clicked: boolean };

export const EMPTY_STORE: Store = { gates: {}, clicked: false };

export const GATE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SHOWS_PER_GATE = 4;
export const MAX_SESSION_DISMISSALS = 3;

const NEW_GATE: GateState = { shows: 0, lastShownAt: 0, quietUntil: 0 };

export function canShow(
  store: Store,
  gate: string,
  now: number,
  sessionDismissals: number,
): boolean {
  if (store.clicked) return false;
  if (sessionDismissals >= MAX_SESSION_DISMISSALS) return false;
  const g = store.gates[gate] ?? NEW_GATE;
  if (g.shows >= MAX_SHOWS_PER_GATE) return false;
  if (now < g.quietUntil) return false;
  return now - g.lastShownAt >= GATE_COOLDOWN_MS;
}

export function recordShow(store: Store, gate: string, now: number): Store {
  const g = store.gates[gate] ?? NEW_GATE;
  return {
    clicked: store.clicked,
    gates: { ...store.gates, [gate]: { ...g, shows: g.shows + 1, lastShownAt: now } },
  };
}

export function recordDismiss(store: Store, gate: string, now: number): Store {
  const g = store.gates[gate] ?? NEW_GATE;
  return {
    clicked: store.clicked,
    gates: { ...store.gates, [gate]: { ...g, quietUntil: now + DISMISS_COOLDOWN_MS } },
  };
}

export function recordClick(store: Store): Store {
  return { clicked: true, gates: store.gates };
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A stored string back into a Store. Anything it does not recognise is empty,
 * the old single-counter shape included: worst case somebody who had used up
 * their four shows is asked again, once per gate.
 */
export function parseStore(raw: string | null): Store {
  if (!raw) return EMPTY_STORE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_STORE;
  }
  if (typeof data !== "object" || data === null) return EMPTY_STORE;
  const { gates, clicked } = data as { gates?: unknown; clicked?: unknown };
  if (typeof gates !== "object" || gates === null) return EMPTY_STORE;

  const kept: Record<string, GateState> = {};
  for (const [name, value] of Object.entries(gates as Record<string, unknown>)) {
    const g = value as Partial<GateState> | null;
    if (g && isNumber(g.shows) && isNumber(g.lastShownAt) && isNumber(g.quietUntil)) {
      kept[name] = { shows: g.shows, lastShownAt: g.lastShownAt, quietUntil: g.quietUntil };
    }
  }
  return { gates: kept, clicked: clicked === true };
}
