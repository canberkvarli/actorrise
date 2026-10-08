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

  it('moves when the turn ends on a partly heard line', () => {
    const r = read('twenty four and');
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
