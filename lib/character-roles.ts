/**
 * Which lines belong to the actor.
 *
 * Mirrors backend/app/services/character_names.py so the rehearsal UI and the
 * server agree on whose turn it is. Two things make this more than a string
 * compare:
 *
 *   - an actor can cover several parts in one run
 *   - a script can cue two characters at once ("MOEKETSI AND DAN:"), and that
 *     line belongs to whoever is playing either of them
 */

/** Identity key for a cue label: case, spacing, punctuation and cue notes removed. */
export function normalizeRole(name: string | null | undefined): string {
  return String(name ?? "")
    .replace(/\s*\([^)]*\)\s*$/, "")   // (CONT'D), (V.O.), (O.S.)
    .replace(/^[\s:;,.\-–—]+/, "")
    .replace(/[\s:;,.\-–—]+$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const COMPOUND_SPLIT = /\s*(?:&|\/|\+|\band\b|,)\s*/i;

/**
 * Participants of a joint cue, or null when the label is a character in its own
 * right. Every part must be a character the scene already knows, so a name that
 * merely contains a separator ("Anderson") is left alone.
 */
export function splitCompoundCue(
  name: string | null | undefined,
  knownCharacters: readonly string[],
): string[] | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;

  const known = new Map<string, string>();
  for (const k of knownCharacters) {
    const key = normalizeRole(k);
    if (key) known.set(key, k);
  }
  if (!known.size) return null;
  if (known.has(normalizeRole(raw))) return null;

  const parts = raw.split(COMPOUND_SPLIT).filter((p) => p && p.trim());
  if (parts.length < 2) return null;

  const resolved: string[] = [];
  for (const part of parts) {
    const actual = known.get(normalizeRole(part));
    if (!actual) return null;
    if (!resolved.includes(actual)) resolved.push(actual);
  }
  return resolved.length >= 2 ? resolved : null;
}

/** Whether a line is the actor's to speak. */
export function ownsLine(
  lineCharacter: string | null | undefined,
  userRoles: readonly string[],
  knownCharacters: readonly string[] = [],
): boolean {
  const owned = new Set(userRoles.map(normalizeRole).filter(Boolean));
  if (!owned.size) return false;

  const key = normalizeRole(lineCharacter);
  if (owned.has(key)) return true;

  const others = knownCharacters.filter((k) => normalizeRole(k) !== key);
  const participants = splitCompoundCue(lineCharacter, others);
  return participants ? participants.some((p) => owned.has(normalizeRole(p))) : false;
}

/** A stem shorter than this is too thin to be worth flagging. */
const MIN_NICKNAME_STEM = 3;

/**
 * Pairs that look like one character written two ways, for the actor to confirm.
 *
 * Mirrors suggest_character_merges() in the backend. Scripts shorten names as they
 * go — "DANIEL" on page one, "DAN" on page three — and the parser can only record
 * what it reads. Left alone, picking the short half hands the actor a fragment of
 * their part.
 *
 * Deliberately a suggestion, never automatic: "Dan"/"Daniel" is almost always one
 * person, but "Ann"/"Anna" is almost always two, and spelling can't tell them apart.
 *
 * Returns [keep, mergeIntoKeep] with the better-attested spelling first.
 */
export function suggestRoleMerges(
  names: readonly string[],
  lineCounts: Readonly<Record<string, number>> = {},
): Array<[string, string]> {
  const candidates = names.filter(
    (n) => n && n.trim() && !splitCompoundCue(n, names.filter((o) => o !== n)),
  );

  const out: Array<[string, string]> = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = normalizeRole(candidates[i]);
      const b = normalizeRole(candidates[j]);
      const [short, long] = a.length < b.length ? [a, b] : [b, a];
      if (short.length < MIN_NICKNAME_STEM || short === long) continue;
      if (!long.startsWith(short)) continue;
      const [x, y] = [candidates[i], candidates[j]];
      out.push((lineCounts[x] ?? 0) >= (lineCounts[y] ?? 0) ? [x, y] : [y, x]);
    }
  }
  return out;
}

/**
 * Roles a session is being rehearsed with. `user_characters` is absent on
 * sessions created before multi-role, so fall back to the single character.
 */
export function sessionRoles(
  session: { user_character?: string | null; user_characters?: string[] | null } | null | undefined,
): string[] {
  if (!session) return [];
  const many = session.user_characters?.filter((c) => c && c.trim());
  if (many?.length) return many;
  return session.user_character ? [session.user_character] : [];
}
