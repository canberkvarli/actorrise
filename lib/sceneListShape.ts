/**
 * Which layout a script's scenes deserve.
 *
 * The panel drew one layout for every script: a numbered, chevroned list
 * grouped by act. Measured across the library, 11 of 20 scripts hold exactly
 * ONE scene, 6 hold several without acts, and only 3 have acts at all — so the
 * common case was the one the list served worst. A numeral labelling a list of
 * one, a disclosure chevron marooned at the far right of a 1,420px row, and an
 * act heading above the only act are all furniture for a choice the actor does
 * not have.
 */

export type SceneListShape = "empty" | "solo" | "list" | "grouped";

type ActBearing = { act?: string | null };

export function sceneListShape(scenes: ActBearing[]): SceneListShape {
  if (scenes.length === 0) return "empty";
  if (scenes.length === 1) return "solo";

  // More than one act is what makes act headings mean something. All in one
  // act, or none in any, reads as a plain list: "Act 1 (4 scenes)" above the
  // only act is a heading for nothing.
  const acts = new Set(scenes.map((s) => s.act ?? null));
  return acts.size > 1 ? "grouped" : "list";
}
