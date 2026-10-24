/**
 * How much of the actor's own lines the page shows: the whole script, the
 * first words as a cue, or nothing until it is said. Partner lines are always
 * shown; they are the cues.
 *
 * Off the script the words still fill in, one by one, as the actor says them,
 * because the reading position already knows which word they are on. Stuck,
 * they call for a line and the next word shows, marked as given rather than
 * remembered. Once a line is read it shows in full, with what was missed and
 * what was given marked, so the actor sees where they went off.
 *
 * Pure, so book.test.ts pins it without a page.
 */
export type Book = 'script' | 'cues' | 'off';

export const BOOKS: { id: Book; label: string }[] = [
  { id: 'script', label: 'Script' },
  { id: 'cues', label: 'Cues' },
  { id: 'off', label: 'Off book' },
];

/** The first words a cue shows. Never the whole line: a two-word line shows one. */
export const CUE_WORDS = 2;

export function cueWords(n: number): number {
  return Math.max(0, Math.min(CUE_WORDS, n - 1));
}

/**
 * One of the actor's words, as the page shows it: `shown` plainly, `hidden`
 * (a bar the word's width), `given` (shown because they called for it), and
 * on a line already read `missed` (never heard).
 */
export type WordShow = 'shown' | 'hidden' | 'given' | 'missed';

export function showWord(book: Book, i: number, n: number, read: boolean,
  heard: ReadonlySet<number>, given: ReadonlySet<number>): WordShow {
  if (book === 'script') return 'shown';
  if (given.has(i)) return 'given';
  if (heard.has(i)) return 'shown';
  if (read) return 'missed';
  if (book === 'cues' && i < cueWords(n)) return 'shown';
  return 'hidden';
}

/**
 * The word a call for a line gives: the first hidden word from where the
 * actor is reading, else the first hidden word anywhere in the line. Null
 * when nothing is left to give.
 */
export function nextGiven(book: Book, n: number, position: number,
  heard: ReadonlySet<number>, given: ReadonlySet<number>): number | null {
  if (book === 'script') return null;
  const hidden = (i: number) => showWord(book, i, n, false, heard, given) === 'hidden';
  for (let i = Math.max(0, position); i < n; i++) if (hidden(i)) return i;
  for (let i = 0; i < Math.min(position, n); i++) if (hidden(i)) return i;
  return null;
}
