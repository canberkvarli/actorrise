import { describe, expect, it } from 'vitest';
import type { ScenePayload } from './contract';
import { defaultVoice, initialVoices, savedPart } from './prefs';

const payload = {
  characters: ['ANNA', 'BEN'],
  voices: [{ id: 'ash', label: 'Ash', gender: 'male' }, { id: 'coral', label: 'Coral', gender: 'female' }],
  defaults: { ANNA: { BEN: 'ash' }, BEN: { ANNA: 'coral' } },
} as unknown as ScenePayload;

describe('savedPart', () => {
  it('is the saved primary role when the scene has that character, case aside', () => {
    expect(savedPart(payload.characters, ['anna'])).toBe('ANNA');
  });

  it('is nothing when nothing was saved or the saved part is not in this scene', () => {
    expect(savedPart(payload.characters, [])).toBeNull();
    expect(savedPart(payload.characters, ['HAMLET'])).toBeNull();
  });

  it('only looks at the primary role, the first entry', () => {
    expect(savedPart(payload.characters, ['HAMLET', 'BEN'])).toBeNull();
  });
});

describe('defaultVoice', () => {
  it("is the server's pick for the character when someone else reads opposite them", () => {
    expect(defaultVoice(payload, 'BEN')).toBe('ash');
    expect(defaultVoice(payload, 'ANNA')).toBe('coral');
  });

  it('falls back to the first voice', () => {
    expect(defaultVoice({ ...payload, defaults: {} }, 'BEN')).toBe('ash');
    expect(defaultVoice({ ...payload, defaults: {}, voices: [] }, 'BEN')).toBe('');
  });
});

describe('initialVoices', () => {
  it('starts every character on the default when nothing was saved', () => {
    expect(initialVoices(payload, {})).toEqual({ ANNA: 'coral', BEN: 'ash' });
  });

  it('prefers a saved voice that this payload knows', () => {
    expect(initialVoices(payload, { BEN: 'coral' })).toEqual({ ANNA: 'coral', BEN: 'coral' });
  });

  it('ignores a saved voice the payload does not offer, or a null one', () => {
    expect(initialVoices(payload, { BEN: 'nobody', ANNA: null })).toEqual({ ANNA: 'coral', BEN: 'ash' });
  });

  it('matches saved characters case aside', () => {
    expect(initialVoices(payload, { ben: 'coral' })).toEqual({ ANNA: 'coral', BEN: 'coral' });
  });
});
