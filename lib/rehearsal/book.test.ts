import { describe, expect, it } from 'vitest';
import { cueWords, nextGiven, showWord } from './book';

const none = new Set<number>();

describe('showWord', () => {
  it('shows everything on the script', () => {
    expect(showWord('script', 5, 8, false, none, none)).toBe('shown');
  });

  it('off book, a word is hidden until it is said', () => {
    expect(showWord('off', 0, 8, false, none, none)).toBe('hidden');
    expect(showWord('off', 0, 8, false, new Set([0]), none)).toBe('shown');
  });

  it('cues show the first two words and hide the rest', () => {
    expect(showWord('cues', 1, 8, false, none, none)).toBe('shown');
    expect(showWord('cues', 2, 8, false, none, none)).toBe('hidden');
  });

  it('a cue never gives away the whole line', () => {
    expect(cueWords(2)).toBe(1);
    expect(cueWords(1)).toBe(0);
    expect(cueWords(9)).toBe(2);
  });

  it('a word called for is given, not remembered, even once it is said', () => {
    expect(showWord('off', 3, 8, false, new Set([3]), new Set([3]))).toBe('given');
  });

  it('a line read shows in full, with what was never heard marked', () => {
    expect(showWord('off', 4, 8, true, new Set([0, 1]), none)).toBe('missed');
    expect(showWord('off', 1, 8, true, new Set([0, 1]), none)).toBe('shown');
    expect(showWord('cues', 0, 8, true, none, none)).toBe('missed');
  });
});

describe('nextGiven', () => {
  it('gives the first hidden word from where the actor is', () => {
    expect(nextGiven('off', 6, 2, new Set([0, 1]), none)).toBe(2);
  });

  it('skips words already said or given', () => {
    expect(nextGiven('off', 6, 2, new Set([0, 1, 3]), new Set([2]))).toBe(4);
  });

  it('goes back for a word skipped on the way when the rest is out', () => {
    expect(nextGiven('off', 4, 4, new Set([0, 2, 3]), none)).toBe(1);
  });

  it('starts past the cue words', () => {
    expect(nextGiven('cues', 6, 0, none, none)).toBe(2);
  });

  it('gives nothing on the script, or when nothing is hidden', () => {
    expect(nextGiven('script', 6, 0, none, none)).toBeNull();
    expect(nextGiven('off', 2, 2, new Set([0, 1]), none)).toBeNull();
  });
});
