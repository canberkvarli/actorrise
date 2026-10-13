import { describe, expect, it } from 'vitest';
import { EMPTY_READ, liveRead, lineWords, shouldHandOver } from './live-read';

const LINE = "Twenty-four, and I've been doing this since I was nine.";

describe('liveRead', () => {
  it('reads nothing from silence', () => {
    const r = liveRead(lineWords(LINE), '');
    expect(r.matched.size).toBe(0);
    expect(r.score).toBe(0);
    expect(r.lastWordMatched).toBe(false);
  });

  it('grows as the transcript grows', () => {
    const words = lineWords(LINE);
    const a = liveRead(words, 'twenty four');
    const b = liveRead(words, "twenty four and I've been");
    expect(b.matched.size).toBeGreaterThan(a.matched.size);
    expect(b.score).toBeGreaterThan(a.score);
  });

  it('knows when the final word has landed', () => {
    const words = lineWords(LINE);
    expect(liveRead(words, "twenty four and I've been doing this since I was").lastWordMatched).toBe(false);
    expect(liveRead(words, "twenty four and I've been doing this since I was nine").lastWordMatched).toBe(true);
  });

  it('survives a transcriber revising its earlier words', () => {
    // The streaming model does this routinely as more audio arrives: a first
    // pass of "a nita" becomes "Anita". Re-reading from the start each delta is
    // what makes that harmless.
    const words = lineWords('Anita left before the hearing.');
    const first = liveRead(words, 'a nita left');
    const revised = liveRead(words, 'Anita left before the hearing');
    expect(first.matched.size).toBeGreaterThan(0);
    expect(revised.lastWordMatched).toBe(true);
  });

  it('treats an empty line as already read', () => {
    const r = liveRead([], 'anything');
    expect(r.lastWordMatched).toBe(true);
    expect(r.score).toBe(1);
  });
});

describe('shouldHandOver', () => {
  const read = (transcript: string) => liveRead(lineWords(LINE), transcript);

  it('does not move while the actor is mid-line', () => {
    expect(shouldHandOver({ ...read('twenty four and'), turnEnded: false })).toBe(false);
  });

  it('moves the instant the last word lands, without waiting for the turn to end', () => {
    const r = read("twenty four and I've been doing this since I was nine");
    expect(r.lastWordMatched).toBe(true);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(true);
  });

  it('does not move on a bare echo of the last word', () => {
    // Primed with the script, a transcriber can produce the final word off a
    // cough. One word is not a delivered line.
    const r = read('nine');
    expect(r.lastWordMatched).toBe(true);
    expect(r.score).toBeLessThan(0.5);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(false);
  });

  it('does not move when the turn ends early in the line: the actor paused, they did not finish', () => {
    // Prod, Hamlet I.i: "Nay," then a breath, and the scene took the line away.
    const r = read('twenty four and');
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(false);
  });

  it('a 7-word line with only its first word heard does not move on quiet', () => {
    const words = lineWords('Nay, answer me. Stand and unfold yourself.');
    expect(words).toHaveLength(7);
    expect(shouldHandOver({ ...liveRead(words, 'nay'), turnEnded: true })).toBe(false);
  });

  it('a 7-word line with five words heard moves on quiet', () => {
    const words = lineWords('Nay, answer me. Stand and unfold yourself.');
    const r = liveRead(words, 'nay answer me stand and');
    expect(r.lastWordMatched).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('a long line whose tail was heard moves on quiet even when most of it was misheard', () => {
    const words = lineWords('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty');
    expect(words).toHaveLength(20);
    const r = liveRead(words, 'one two three four five twenty');
    expect(r.lastWordMatched).toBe(true);
    expect(r.score).toBeCloseTo(0.3);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('the second-to-last word counts as reaching the tail', () => {
    const words = lineWords('one two three four five six seven eight nine ten');
    const r = liveRead(words, 'one two nine');
    expect(r.lastWordMatched).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('never moves on a turn that ended with nothing heard', () => {
    // The exact failure that started this: the scene moved on for an actor who
    // had said nothing. An empty transcript is room noise, not a performance.
    expect(shouldHandOver({ ...EMPTY_READ, turnEnded: true })).toBe(false);
    expect(shouldHandOver({ ...read(''), turnEnded: true })).toBe(false);
  });

  it('never moves on silence with no turn end either', () => {
    expect(shouldHandOver({ ...EMPTY_READ, turnEnded: false })).toBe(false);
  });
});
