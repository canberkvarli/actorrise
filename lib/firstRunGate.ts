/**
 * Where the first-rehearsal gate must keep its hands off.
 *
 * The gate watches for a returning actor who has never rehearsed and sends
 * them to /first-scene, which picks a monologue and replaces to
 * /monologue/<id>/work. That is right for someone drifting on the library
 * shelf. It is wrong anywhere the actor has already said what they want.
 *
 * Extracted from the component so the rule is a value a test can hold. The
 * component previously carried it inline, and the omission below cost a real
 * user a hijacked session.
 */

/** Paths where the gate never fires at all. */
export const SKIP_PREFIXES = [
  "/first-scene",
  "/checkout",
  "/billing",
  "/auth",
  // ScenePartner's own shelf. Someone who opened it is ALREADY on their way to
  // rehearse — that is the entire purpose of the room — so pulling them out of
  // it and into a monologue overrides the exact intent the gate exists to
  // create. Observed 2026-09-23: /practice rendered, the gate fired a beat
  // later, and the actor landed on /monologue/45/work without touching
  // anything. It is the same fault the /monologue entry below was added for.
  "/practice",
];

/** Rooms already in progress: never interrupt one. */
export const IMMERSIVE_RE =
  /^\/scenes\/[^/]+\/rehearse|^\/practice\/[^/]+\/scenes\/[^/]+\/edit|^\/monologue\/[^/]+\/(work|memorize)/;

/** True when the gate is allowed to redirect away from `path`. */
export function gateMayFire(path: string): boolean {
  const p = path || "";
  if (SKIP_PREFIXES.some((prefix) => p.startsWith(prefix))) return false;
  if (IMMERSIVE_RE.test(p)) return false;
  return true;
}
