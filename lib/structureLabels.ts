/**
 * Act and scene labels, in the play's own language.
 *
 * The parser stores structure in English whatever the play is spoken in:
 * "Act 2", "Scene 3", "Prologue" (backend/app/services/script_structure.py,
 * which also reads PERDE and SAHNE into those same labels). Some scripts carry
 * a bare "2". A Turkish play reads "2. Perde", "3. Sahne", "Prolog", on the
 * English UI as well; an English play reads "Act 2" on the Turkish UI. The
 * labels belong to the play, the way its words do.
 *
 * The language is the play's, from the server (`language` on the scene, the
 * scan, the scene map, What's next and the rehearsal payload), never the UI.
 *
 * Only labels in those shapes are translated. Anything a script spelled out
 * itself ("The Ballroom", "INT. OFFICE - DAY", an act a teacher named) is
 * shown as it is. An English play is left exactly as it was: this returns the
 * label untouched, so a screen that showed "2" still shows "2".
 */
import { translate } from "./i18n";
import { speechLang } from "./speech-language";

export type StructureKind = "act" | "scene";

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

/** "III" → 3; an arabic numeral as it is. Null for anything else. */
function toNumber(n: string): number | null {
  if (/^\d+$/.test(n)) return parseInt(n, 10);
  const s = n.toUpperCase();
  if (!/^[IVXLC]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    const next = ROMAN[s[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total > 0 ? total : null;
}

const SHAPED: Record<StructureKind, RegExp> = {
  act: /^act\s+(\d+|[ivxlc]+)\.?$/i,
  scene: /^scene\s+(\d+|[ivxlc]+)\.?$/i,
};

/**
 * One label (an act or a scene) in the play's language, `language` as the
 * server sends it ("tr"; absent or anything else is English). Null and empty
 * stay as they are.
 */
export function localizeStructure<T extends string | null | undefined>(
  raw: T,
  kind: StructureKind,
  language: string | null | undefined,
): T | string {
  const locale = speechLang(language);
  if (locale === "en" || !raw) return raw;
  const label = raw.trim();
  if (/^prologue\.?$/i.test(label)) return translate(locale, "playStructure.prologue");
  if (/^epilogue\.?$/i.test(label)) return translate(locale, "playStructure.epilogue");
  const shaped = label.match(SHAPED[kind]);
  // A bare numeral: I, V and X only, so a scene called "C" or "L" stays a letter.
  const numeral = shaped ? shaped[1] : /^(\d+|[ivx]+)$/i.test(label) ? label : null;
  const n = numeral === null ? null : toNumber(numeral);
  // Arabic numerals: a Turkish lowercase turns "III" into "ııı".
  if (n !== null) return translate(locale, kind === "act" ? "playStructure.act" : "playStructure.scene", { n });
  return raw;
}
