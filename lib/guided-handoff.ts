/**
 * What the hub's Answer tap hands the rehearse page.
 *
 * The invitation asks for the microphone inside the tap, with the partner's
 * line still on screen. The rehearse page then asked the browser whether the
 * mic was granted, and iOS has no answer to that question: Safari and Chrome
 * on an iPhone do not implement the microphone permission query, so the page
 * read "unknown", held the scene behind a second screen ("Your first scene.
 * I'll read Riley.") and a second button, and an actor who had just tapped
 * Answer was asked to tap Begin.
 *
 * The tap already knows. This carries what it learned across the route change
 * so the page can walk straight on. It is short-lived on purpose: it describes
 * one tap, not the state of the device.
 *
 * Pure, with the storage passed in, so the rules can be tested.
 */

export const HANDOFF_KEY = "actorrise_guided_handoff";
/** Long enough for a slow route change, short enough to mean "just now". */
export const HANDOFF_TTL_MS = 2 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Handoff = { mic: "granted" | "denied"; at: number };

export function writeHandoff(store: Store, mic: Handoff["mic"], now: number): void {
  try {
    store.setItem(HANDOFF_KEY, JSON.stringify({ mic, at: now } satisfies Handoff));
  } catch {
    /* storage unavailable: the page falls back to asking, which is what it did before */
  }
}

/** The handoff, if there is one and it is fresh. Does not clear it. */
export function readHandoff(store: Store, now: number): Handoff | null {
  let raw: string | null;
  try {
    raw = store.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Handoff> | null;
    if (!data || (data.mic !== "granted" && data.mic !== "denied")) return null;
    if (typeof data.at !== "number" || !Number.isFinite(data.at)) return null;
    if (now - data.at > HANDOFF_TTL_MS || data.at > now + 1000) return null;
    return { mic: data.mic, at: data.at };
  } catch {
    return null;
  }
}

/** Used once: a restart or a reload asks the browser again. */
export function clearHandoff(store: Store): void {
  try {
    store.removeItem(HANDOFF_KEY);
  } catch {
    /* nothing to do */
  }
}
