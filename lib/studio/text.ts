/**
 * A monologue as lines the actor can pin moments to. Plain TS for Ghost Light.
 *
 * Most pieces in the library keep the playwright's line breaks; prose pieces
 * arrive as one or two long paragraphs, so those are cut at sentence ends
 * instead. The text itself is never stored in the notebook: it comes from the
 * library each time, through the same read wall as everywhere else.
 */

export function splitLines(text: string): string[] {
  const byBreak = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const longest = Math.max(0, ...byBreak.map((l) => l.length));
  if (byBreak.length >= 4 && longest < 400) return byBreak;
  return byBreak.flatMap((p) =>
    p
      .split(/(?<=[.!?…]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
