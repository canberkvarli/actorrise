import type { MessageKey } from "@/lib/i18n";

/**
 * The shelf's genres are stored and sent in English ("Comedy"); only the label
 * a person reads is translated. A genre the dictionary does not know (one the
 * script came in with) is shown as it was stored.
 */
export function genreLabel(t: (key: MessageKey) => string, genre: string): string {
  const key = `appPracticeGenres.${genre}` as MessageKey;
  const label = t(key);
  return label === key ? genre : label;
}

/** lib/scenes formatSceneDuration, with the unit in the reader's language. */
export function sceneDurationLabel(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  seconds: number | null | undefined,
): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  return mins >= 1
    ? t("appPracticeUnits.minutes", { n: mins })
    : t("appPracticeUnits.seconds", { n: seconds });
}

type Tr = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** A label from a namespace keyed by the stored value, or the value as stored. */
function valueLabel(t: Tr, ns: string, value: string): string {
  const key = `${ns}.${value}` as MessageKey;
  const label = t(key);
  return label === key ? value : label;
}

/** lib/shelf's age bands ("20s") as the reader says them. */
export function ageLabel(t: Tr, age: string): string {
  return valueLabel(t, "appPracticeAges", age);
}

/** lib/shelf's tones ("dramatic"), lowercase as stored; a menu capitalises. */
export function toneLabel(t: Tr, tone: string): string {
  return valueLabel(t, "appPracticeTones", tone);
}

/** lib/shelf describeCharacter, "Nora (F, 30s)", with the letters translated.
 *  The character's name is the play's and stays as written. */
export function characterLabel(
  t: Tr,
  c: { name: string; gender?: string | null; age?: string | null },
): string {
  const gender =
    c.gender === "male"
      ? t("appPracticeCharacter.male")
      : c.gender === "female"
        ? t("appPracticeCharacter.female")
        : undefined;
  const age = c.age && c.age !== "any" ? ageLabel(t, c.age) : undefined;
  const bits = [gender, age].filter(Boolean).join(", ");
  return bits ? `${c.name} (${bits})` : c.name;
}

/** lib/shelf contributorLine, translated. */
export function contributorLabel(
  t: Tr,
  mine: { contributor: boolean; opens: number } | undefined,
): string | null {
  if (!mine?.contributor) return null;
  const n = mine.opens;
  if (n <= 0) return t("appPracticeCharacter.contributor");
  return t(n === 1 ? "appPracticeCharacter.contributorOne" : "appPracticeCharacter.contributorMany", { n });
}
