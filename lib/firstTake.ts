/**
 * Where a first run of a piece stops.
 *
 * Measured 2026-10-21: finished runs were a median 114 words, unfinished ones
 * 137, and an iPhone finished 4 of 13. A first run that is the whole piece is a
 * minute and a half of saying words you read once. So the first run is the
 * opening stretch, about half a minute, and finishing it counts as finishing.
 * The rest of the piece is one tap on ("keep going").
 *
 * Returns how many lines the first take holds. A piece with little left over
 * after the take is run whole: stopping two lines from the end is not a take,
 * it is an interruption.
 */
export const FIRST_TAKE_MAX_LINES = 6;
export const FIRST_TAKE_MAX_WORDS = 70;
/** A take never stops with this few lines (or fewer) left. */
export const FIRST_TAKE_MIN_REST = 2;

function words(line: string): number {
  return line.split(/\s+/).filter(Boolean).length;
}

export function firstTakeEnd(lines: string[]): number {
  let count = 0;
  let total = 0;
  for (const line of lines) {
    if (count >= FIRST_TAKE_MAX_LINES) break;
    const w = words(line);
    // Always at least two lines, however long they are: one line is not a run.
    if (count >= 2 && total + w > FIRST_TAKE_MAX_WORDS) break;
    count += 1;
    total += w;
  }
  return lines.length - count <= FIRST_TAKE_MIN_REST ? lines.length : count;
}
