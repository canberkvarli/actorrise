import { describe, it, expect } from 'vitest';
import { shouldAdvance, MIN_QUIET_MS, type AdvanceState } from './advance-rule';

const state = (over: Partial<AdvanceState> = {}): AdvanceState => ({
  msSinceVoice: 0,
  score: 0,
  lastWordMatched: false,
  heardAnySpeech: false,
  ...over,
});

describe('shouldAdvance — the invariant', () => {
  it('never advances while the microphone is still hearing sound', () => {
    // This is the whole "don't cut me off mid-word" fix. No combination of
    // score or word position may override it.
    for (const s of [
      state({ msSinceVoice: 0, score: 1, lastWordMatched: true, heardAnySpeech: true }),
      state({ msSinceVoice: 50, score: 1, lastWordMatched: true, heardAnySpeech: true }),
      state({ msSinceVoice: MIN_QUIET_MS - 1, score: 1, lastWordMatched: true, heardAnySpeech: true }),
    ]) {
      expect(shouldAdvance(s)).toBe(false);
    }
  });

  it('never advances on a take where nothing was heard at all', () => {
    // Silence is the skip-if-silent timer's business, not this rule's.
    expect(shouldAdvance(state({ msSinceVoice: 60_000, heardAnySpeech: false }))).toBe(false);
  });
});

describe('shouldAdvance — finishing the line', () => {
  it('advances as soon as the last word lands and the actor stops', () => {
    expect(shouldAdvance(state({
      msSinceVoice: MIN_QUIET_MS,
      score: 1,
      lastWordMatched: true,
      heardAnySpeech: true,
    }))).toBe(true);
  });

  it('advances on the last word even when the mic dropped some of the middle', () => {
    expect(shouldAdvance(state({
      msSinceVoice: MIN_QUIET_MS,
      score: 0.6,
      lastWordMatched: true,
      heardAnySpeech: true,
    }))).toBe(true);
  });

  it('does not advance on the final word alone one word into a long speech', () => {
    // A line ending on "you" must not jump the moment "you" is said early.
    expect(shouldAdvance(state({
      msSinceVoice: MIN_QUIET_MS,
      score: 0.1,
      lastWordMatched: true,
      heardAnySpeech: true,
    }))).toBe(false);
  });
});

describe('shouldAdvance — fallbacks', () => {
  it('advances after a longer pause when the tail was misheard', () => {
    const s = state({ score: 0.8, lastWordMatched: false, heardAnySpeech: true });
    expect(shouldAdvance({ ...s, msSinceVoice: 400 })).toBe(false);
    expect(shouldAdvance({ ...s, msSinceVoice: 900 })).toBe(true);
  });

  it('does not use the shorter fallback on a half-read line', () => {
    expect(shouldAdvance(state({
      msSinceVoice: 900,
      score: 0.6,
      lastWordMatched: false,
      heardAnySpeech: true,
    }))).toBe(false);
  });

  it('advances on a long silence so a trailed-off line is never a trap', () => {
    const s = state({ score: 0.2, lastWordMatched: false, heardAnySpeech: true });
    expect(shouldAdvance({ ...s, msSinceVoice: 2_000 })).toBe(false);
    expect(shouldAdvance({ ...s, msSinceVoice: 2_500 })).toBe(true);
  });

  it('never advances when speech was heard but not one word was recognized', () => {
    // The actor is audible and nothing matched, so recognition is failing on
    // this line. Advancing here would cancel the Whisper transcription that is
    // the actor's only remaining chance of being heard at all, and record the
    // line as never delivered. Let the take run; Whisper owns this case.
    expect(shouldAdvance(state({
      msSinceVoice: 60_000,
      score: 0,
      lastWordMatched: false,
      heardAnySpeech: true,
    }))).toBe(false);
  });
});
