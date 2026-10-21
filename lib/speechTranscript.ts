/**
 * What the actor has said since the last reset, from a Web Speech result list.
 *
 * The hook used to read only the results from `resultIndex` on and keep its own
 * running total, clearing that total on reset. Chrome reports just the new
 * results, so that worked there. Safari does not: in continuous mode it hands
 * back everything said since the mic opened, from index 0, every time. A reset
 * lasted until the next word, the line you had just finished came straight back,
 * and with the whole session in the transcript most of the next line's words
 * were already "heard". The run jumped a line.
 *
 * So read the whole list on every event, the same on every browser, and mark a
 * reset as a word count: everything up to it is the past.
 */
export type SpeechResults = ArrayLike<ArrayLike<{ transcript: string }>>;

export function wordsFromResults(results: SpeechResults): string[] {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const best = results[i]?.[0];
    if (best?.transcript) parts.push(best.transcript);
  }
  return parts.join(" ").split(/\s+/).filter(Boolean);
}

/** The words after the reset mark. */
export function sinceReset(words: string[], resetAt: number): string {
  return words.slice(resetAt).join(" ");
}
