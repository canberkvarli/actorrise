/**
 * A colour per character, so a page of script can be read by who is speaking.
 *
 * A scene is a wall of identical monospace with a name over every paragraph.
 * To find your own cue you read every name, which is the opposite of what a
 * page of sides is for — an actor flicks down the left edge and sees their
 * lines. The rehearsal screen already draws a coloured initial for each
 * character, but only when a voice map was saved from the old editor, so the
 * script view (where the actor actually reads) had nothing at all.
 *
 * Derived from the name rather than stored, for two reasons. A scene has no
 * cast table to hang a colour off, and a colour that is computed is the same
 * colour in the script, in the rehearsal and in the review, without three
 * places having to agree about a row in a database.
 *
 * Hues only, as CSS custom properties. The page decides how to spend them —
 * ink on paper here, a filled chip there — so one palette serves both themes
 * without a dark-mode variant per character.
 */

/**
 * Enough hues that a two-hander never collides and a ten-hander rarely does,
 * each far enough from the next to be told apart at a glance, and none of them
 * near the accent orange that means "you" everywhere else in the product.
 */
const HUES = [205, 262, 150, 320, 42, 185, 285, 100, 230, 340] as const;

/**
 * Case- and punctuation-insensitive, because the same character is written
 * "MARCELLUS", "Marcellus" and "Marcellus." across one extracted script, and
 * three colours for one man is worse than no colour at all.
 */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** FNV-1a. Small, stable, and not sensitive to name length the way a sum is. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The hue for this character when the rest of the cast is not known. */
export function characterHue(name: string): number {
  const key = normalizeName(name || "");
  if (!key) return HUES[0];
  return HUES[hash(key) % HUES.length];
}

/**
 * Hues for a whole cast, by position rather than by hash.
 *
 * Hashing alone collides, and it collided on the first scene it was tried on:
 * of HORATIO, MARCELLUS, FRANCISCO and BARNARDO, two came out the same colour,
 * which is worse than no colour at all because it says they are the same
 * person. Within one scene the cast is known, so the palette is dealt out in
 * the order the characters first speak. No collision is possible until a
 * scene has more characters than there are hues, and then the wrap is at
 * least predictable.
 *
 * Order of appearance, not alphabetical: the two people who open a scene get
 * the two most distinct colours, which is where the reading actually happens.
 */
export function castPalette(cast: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  let i = 0;
  for (const raw of cast) {
    const key = normalizeName(raw || "");
    if (!key || out.has(key)) continue;
    out.set(key, HUES[i % HUES.length]);
    i++;
  }
  return out;
}

/** The hue for one character, preferring the scene's palette when there is one. */
export function hueIn(palette: Map<string, number> | null | undefined, name: string): number {
  const key = normalizeName(name || "");
  const found = palette?.get(key);
  return found ?? characterHue(name);
}

/**
 * The character's colour as a set of CSS variables to spread onto an element.
 *
 * `--cast-ink` is for text and rules: dark enough to read as type rather than
 * as decoration. `--cast-wash` is the faintest possible tint, for a chip
 * behind an initial.
 */
export function castColorVars(
  name: string,
  palette?: Map<string, number> | null,
): Record<string, string> {
  const h = hueIn(palette, name);
  return {
    "--cast-ink": `oklch(0.52 0.13 ${h})`,
    "--cast-wash": `oklch(0.52 0.13 ${h} / 0.12)`,
  };
}

/** The letter that stands for a character in a chip. */
export function castInitial(name: string): string {
  const letter = (name || "").trim().match(/[a-z0-9]/i);
  return letter ? letter[0].toUpperCase() : "?";
}
