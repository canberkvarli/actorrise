import { describe, expect, it } from 'vitest';
import { goStep, partnerVoices, skipsCurtain, startsBy } from './entry';

const cast = ['ANNA', 'BEN'];
const go = { go: true, resume: false, guided: false };

describe('skipsCurtain', () => {
  it('opens on the saved part when the preview sent the actor in', () => {
    expect(skipsCurtain(cast, ['anna'], go)).toBe('ANNA');
  });

  it('shows the Curtain without ?go=1', () => {
    expect(skipsCurtain(cast, ['ANNA'], { ...go, go: false })).toBeNull();
  });

  it('shows the Curtain when no part was saved, or the saved one is not in this scene', () => {
    expect(skipsCurtain(cast, [], go)).toBeNull();
    expect(skipsCurtain(cast, ['HAMLET'], go)).toBeNull();
  });

  it('picks a run up straight on the Stage, with its saved part', () => {
    expect(skipsCurtain(cast, ['ANNA'], { ...go, resume: true })).toBe('ANNA');
  });

  it('shows the Curtain on a guided run', () => {
    expect(skipsCurtain(cast, ['ANNA'], { ...go, guided: true })).toBeNull();
  });
});

describe('partnerVoices', () => {
  it('sends every other part with a voice, never the actor', () => {
    expect(partnerVoices(['ANNA', 'BEN', 'CARL'], 'anna', { ANNA: 'coral', BEN: 'ash', CARL: '' }))
      .toEqual({ BEN: 'ash' });
  });
});

describe('goStep', () => {
  it('goes back to the Curtain on the Plus gate, whatever else', () => {
    expect(goStep({ gated: true, canBegin: true, started: false })).toBe('curtain');
  });

  it('starts once it can begin, and only once', () => {
    expect(goStep({ gated: false, canBegin: true, started: false })).toBe('start');
    expect(goStep({ gated: false, canBegin: true, started: true })).toBe('wait');
  });

  it('waits while the run is still loading', () => {
    expect(goStep({ gated: false, canBegin: false, started: false })).toBe('wait');
  });
});

describe('startsBy', () => {
  it('begins now on a running context and waits for a tap on a suspended one', () => {
    expect(startsBy(true)).toBe('now');
    expect(startsBy(false)).toBe('tap');
  });
});
