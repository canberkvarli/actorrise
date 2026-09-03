import { describe, it, expect } from 'vitest';
import { normWords, tokenize, wordsMatch, alignWords, wordMatchScore } from './word-match';

/** Convenience: which expected words matched, as booleans. */
function hits(expected: string, transcript: string): boolean[] {
  const exp = tokenize(expected);
  const matched = alignWords(exp, tokenize(transcript));
  return exp.map((_, i) => matched.has(i));
}

describe('normWords', () => {
  it('splits hyphenated words into separate tokens', () => {
    // "Twenty-four" must become two tokens, because that is what the mic hears.
    // Stripping the hyphen without a space produced "twentyfour", which then
    // matched nothing the actor could physically say.
    expect(normWords('Twenty-four.')).toBe('twenty four');
  });

  it('keeps contractions as one token', () => {
    expect(normWords("I've")).toBe('ive');
  });

  it('adds a space after sentence punctuation that is missing one', () => {
    expect(normWords('talk.We')).toBe('talk we');
  });

  it('handles em dashes as word separators', () => {
    expect(normWords('yes—no')).toBe('yes no');
  });
});

describe('wordsMatch', () => {
  it('matches a word to itself', () => {
    expect(wordsMatch('anita', 'anita')).toBe(true);
  });

  it('matches a misheard proper noun', () => {
    expect(wordsMatch('anita', 'aneeta')).toBe(true);
  });

  it('matches a numeral to its spelled form', () => {
    expect(wordsMatch('24', 'twentyfour')).toBe(true);
  });

  it('does not match two different short words', () => {
    // Short words collide easily under any phonetic scheme. "be" and "by"
    // matching would make half a line light up on one syllable.
    expect(wordsMatch('be', 'by')).toBe(false);
  });

  it('does not match two unrelated long words', () => {
    expect(wordsMatch('twenty', 'ferguson')).toBe(false);
  });

  it('matches across a one-character mishearing in a long word', () => {
    expect(wordsMatch('ferguson', 'fergusen')).toBe(true);
  });
});

describe('alignWords — span matching', () => {
  it('matches every word of an exact read', () => {
    expect(hits('Twenty-four.', 'twenty four')).toEqual([true, true]);
  });

  it('matches one expected word against two transcript tokens', () => {
    // Speech recognition splits unfamiliar names: "Anita" -> "a nita"
    expect(hits('Anita', 'a nita')).toEqual([true]);
  });

  it('matches two expected words against one transcript token', () => {
    // ...and sometimes joins them instead.
    expect(hits('twenty four', 'twentyfour')).toEqual([true, true]);
  });

  it('matches a contraction spoken in full', () => {
    expect(hits("I've", 'i have')).toEqual([true]);
  });

  it('leaves unspoken words unmatched', () => {
    expect(hits('how old are you', 'how old')).toEqual([true, true, false, false]);
  });

  it('skips a misheard word without losing the words after it', () => {
    expect(hits('how old are you', 'how xyzzy are you')).toEqual([true, false, true, true]);
  });

  it('matches repeated words in order, not all at once', () => {
    // "no" appearing later in the line must not light up when the first is said.
    expect(hits('no no no', 'no')).toEqual([true, false, false]);
  });

  it('does not match a later word before an earlier one', () => {
    // Monotonic alignment: saying only the last word must not mark the first.
    expect(hits('you love me', 'me')).toEqual([false, false, true]);
  });

  it('matches nothing against an empty transcript', () => {
    expect(hits('how old are you', '')).toEqual([false, false, false, false]);
  });
});

describe('wordMatchScore', () => {
  it('scores a complete read as 1', () => {
    expect(wordMatchScore('Twenty-four.', 'twenty four')).toBe(1);
  });

  it('scores an empty expected line as 1', () => {
    expect(wordMatchScore('', 'anything')).toBe(1);
  });

  it('scores a half-spoken line at 0.5', () => {
    expect(wordMatchScore('how old are you', 'how old')).toBe(0.5);
  });

  it('scores a silent take as 0', () => {
    expect(wordMatchScore('how old are you', '')).toBe(0);
  });
});
