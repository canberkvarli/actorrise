// Relative, not aliased: these run under vitest, which has no config and so no
// "@/" alias. The type import is erased at transform and can stay aliased.
import { splitIntoUnits } from "./monologueSegments";
import type { Monologue } from "@/types/actor";

/**
 * The lines an actor can pin a margin note to.
 *
 * Two structures already describe a monologue and neither one is enough on its
 * own:
 *
 *   text_segments — the reader's blocks: speech, stage direction, another
 *     character's interjection. 86% of the corpus has them and they carry the
 *     styling, so throwing them away would flatten every direction back into
 *     the speech. But they are coarse: a median of 6 blocks at ~224 characters
 *     each, and for 10.9% of pieces there is exactly ONE block, which is the
 *     whole monologue. Anchoring to those would give a tenth of the library a
 *     single notable "line" — the same disease that made Cut useless.
 *
 *   monologueSegments — verse lines, or sentences for prose. Granular for
 *     everything, and the unit Cut already works in, but it knows nothing
 *     about which part is spoken and which is a direction.
 *
 * So: take the blocks for their kind, split each one into units for their
 * grain, and number the result straight through. Styling survives, every piece
 * gets real lines, and a "line" means the same thing here as it does in Cut.
 *
 * `index` is what gets stored on the note. It is this list's own index space,
 * not Cut's — the two are derived from different sources and can disagree when
 * text_segments disagree with text, which they are known to do.
 */

export type BeatKind = "speech" | "direction" | "interjection";

export interface BeatUnit {
  index: number;
  text: string;
  kind: BeatKind;
  /** Present on interjections: the other character who cuts in. */
  speaker?: string | null;
  /** True on the first unit taken from a block, so the reader can space it. */
  startsBlock: boolean;
}

type RawSegment = NonNullable<Monologue["text_segments"]>[number];

function kindOf(seg: RawSegment): BeatKind {
  if (seg.type === "direction") return "direction";
  if (seg.type === "interjection") return "interjection";
  return "speech";
}

export function beatUnits(
  text: string | null | undefined,
  segments?: RawSegment[] | null,
): BeatUnit[] {
  const units: BeatUnit[] = [];

  const push = (
    raw: string,
    kind: BeatKind,
    speaker: string | null | undefined,
    startsBlock: boolean,
  ) => {
    units.push({ index: units.length, text: raw, kind, speaker, startsBlock });
  };

  if (segments && segments.length > 0) {
    for (const seg of segments) {
      const kind = kindOf(seg);
      /* Directions and interjections are not split. They are already short,
         and they are one gesture — "(she turns away)" is a single thing to
         note, not two. Only the speech gets broken down. */
      if (kind !== "speech") {
        const t = (seg.text ?? "").trim();
        if (t) push(t, kind, seg.speaker, true);
        continue;
      }
      const parts = splitIntoUnits(seg.text);
      parts.forEach((p, i) => push(p, "speech", null, i === 0));
    }
    if (units.length > 0) return units;
    // Segments existed but held nothing usable — fall through to the text.
  }

  splitIntoUnits(text).forEach((p, i) => push(p, "speech", null, i === 0));
  return units;
}

/** Stored alongside a note so it can be found again if the text is repaired. */
export function anchorFor(unitText: string): string {
  return unitText.trim().slice(0, 120);
}
