import { describe, expect, it } from 'vitest';
import { REHEARSAL_VOICES, defaultRehearsalVoices, voiceSample } from './scenePrefs';

describe('REHEARSAL_VOICES', () => {
  it('is the ten Gemini voices the rehearsal reads with (backend/app/services/rehearsal/voices.py), five and five', () => {
    expect(REHEARSAL_VOICES.map(v => v.id)).toEqual(
      ['Leda', 'Aoede', 'Sulafat', 'Kore', 'Gacrux', 'Fenrir', 'Puck', 'Achird', 'Charon', 'Algenib']);
    expect(REHEARSAL_VOICES.filter(v => v.gender === 'female')).toHaveLength(5);
  });

  it('has a sample for every voice', () => {
    expect(voiceSample('Puck')).toBe('/voices/puck.mp3');
  });
});

describe('defaultRehearsalVoices', () => {
  it('gives a known gender the first unused voice of that gender', () => {
    const g: Record<string, string> = { BEN: 'male', CARL: 'male' };
    expect(defaultRehearsalVoices(['BEN', 'CARL'], n => g[n])).toEqual({ BEN: 'Fenrir', CARL: 'Puck' });
  });

  it('alternates female, male by position when the gender is unknown', () => {
    expect(defaultRehearsalVoices(['A', 'B', 'C'], () => null)).toEqual({ A: 'Leda', B: 'Fenrir', C: 'Aoede' });
  });

  it('never shares a voice while the list lasts', () => {
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const out = defaultRehearsalVoices(names, () => 'female');
    expect(new Set(Object.values(out).slice(0, 10)).size).toBe(10);
  });
});
