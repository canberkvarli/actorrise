import { describe, it, expect } from 'vitest';
import { syllableCount, buildWordTimings, spokenWordIndex } from './speech-timing';

describe('syllableCount', () => {
  it('counts one syllable words', () => {
    expect(syllableCount('how')).toBe(1);
    expect(syllableCount('old')).toBe(1);
  });

  it('counts multi-syllable words', () => {
    expect(syllableCount('twenty')).toBe(2);
    expect(syllableCount('ferguson')).toBe(3);
  });

  it('does not count a silent trailing e', () => {
    expect(syllableCount('nine')).toBe(1);
    expect(syllableCount('have')).toBe(1);
  });

  it('never returns zero', () => {
    expect(syllableCount('')).toBe(1);
    expect(syllableCount('shh')).toBe(1);
  });
});

describe('buildWordTimings', () => {
  it('spans exactly the audio duration', () => {
    const t = buildWordTimings(['how', 'old', 'are', 'you'], 2000);
    expect(t[0].start).toBe(0);
    expect(t[t.length - 1].end).toBe(2000);
  });

  it('gives every word a slot', () => {
    expect(buildWordTimings(['how', 'old', 'are', 'you'], 2000)).toHaveLength(4);
  });

  it('leaves no gaps between words', () => {
    const t = buildWordTimings(['how', 'old', 'are', 'you'], 2000);
    for (let i = 1; i < t.length; i++) expect(t[i].start).toBe(t[i - 1].end);
  });

  it('gives a longer word more time than a shorter one', () => {
    const [how, ferguson] = buildWordTimings(['how', 'ferguson'], 2000);
    expect(ferguson.end - ferguson.start).toBeGreaterThan(how.end - how.start);
  });

  it('returns nothing for an empty line', () => {
    expect(buildWordTimings([], 2000)).toEqual([]);
  });

  it('returns nothing when the duration is not yet known', () => {
    expect(buildWordTimings(['how', 'old'], 0)).toEqual([]);
  });
});

describe('spokenWordIndex', () => {
  const timings = buildWordTimings(['how', 'old', 'are', 'you'], 2000);

  it('is on the first word at the start', () => {
    expect(spokenWordIndex(timings, 0)).toBe(0);
  });

  it('advances as the audio plays', () => {
    expect(spokenWordIndex(timings, 1999)).toBe(3);
  });

  it('never runs past the last word', () => {
    expect(spokenWordIndex(timings, 99_999)).toBe(3);
  });

  it('is -1 when there is nothing to track', () => {
    expect(spokenWordIndex([], 100)).toBe(-1);
  });
});
