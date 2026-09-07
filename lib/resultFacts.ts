// Relative, not aliased: this runs under vitest, which has no config and so
// no "@/" alias. The type import is erased at transform and can stay aliased.
import { displayableAuthor } from "./utils";
import type { Monologue } from "@/types/actor";

/**
 * Which facts are the same on every result, and so worth saying once.
 *
 * A search for "shakespeare monologue" returned 18 rows, and every one of them
 * printed "William Shakespeare" and "classical". Eighteen repetitions of a
 * fact that never varies is not information, it is the reason the page felt
 * like a wall — the eye has to read past the identical part of every row to
 * reach the part that differs.
 *
 * A card cannot know this: it only ever sees itself. The list can, so the list
 * works it out and tells the card what to leave off, and prints it once above
 * the results instead.
 *
 * Deliberately only fires on a run of results long enough for the repetition
 * to be the thing you notice. Below that, "classical" on both of two rows is
 * just two rows that happen to agree.
 */

const MIN_RESULTS_TO_SUPPRESS = 4;

export interface ConstantFacts {
  /** Present when every result shares one author. */
  author?: string;
  /** Present when every result shares one era (classical | contemporary). */
  era?: string;
}

function eraOf(m: Monologue): string | null {
  const raw = (m.category || "").trim().toLowerCase();
  return raw === "classical" || raw === "contemporary" ? raw : null;
}

export function constantFacts(list: Monologue[]): ConstantFacts {
  if (!Array.isArray(list) || list.length < MIN_RESULTS_TO_SUPPRESS) return {};

  const facts: ConstantFacts = {};

  const authors = new Set<string>();
  for (const m of list) {
    const a = displayableAuthor(m.author);
    // One missing author means the shelf is not uniform, so the label would be
    // a claim about rows it cannot see. Bail rather than overstate.
    if (!a) {
      authors.clear();
      break;
    }
    authors.add(a);
  }
  if (authors.size === 1) facts.author = [...authors][0];

  const eras = new Set<string>();
  for (const m of list) {
    const e = eraOf(m);
    if (!e) {
      eras.clear();
      break;
    }
    eras.add(e);
  }
  if (eras.size === 1) facts.era = [...eras][0];

  return facts;
}

/** The one line that replaces the repetition. Null when nothing is constant. */
export function constantFactsLabel(facts: ConstantFacts): string | null {
  const parts = [facts.author, facts.era].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}
