import { describe, expect, it } from 'vitest';
import { REHEARSAL_VOICES, defaultRehearsalVoices } from './scenePrefs';

describe('REHEARSAL_VOICES', () => {
  it('is the four the rehearsal reads with (backend/app/services/rehearsal/voices.py)', () => {
    expect(REHEARSAL_VOICES.map(v => v.id)).toEqual(['coral', 'ash', 'sage', 'echo']);
  });
});

describe('defaultRehearsalVoices', () => {
  it('gives a known gender the first unused voice of that gender', () => {
    const g: Record<string, string> = { BEN: 'male', CARL: 'male' };
    expect(defaultRehearsalVoices(['BEN', 'CARL'], n => g[n])).toEqual({ BEN: 'ash', CARL: 'echo' });
  });

  it('alternates female, male by position when the gender is unknown', () => {
    expect(defaultRehearsalVoices(['A', 'B', 'C'], () => null)).toEqual({ A: 'coral', B: 'ash', C: 'sage' });
  });

  it('takes any unused voice once a gender runs out, and never shares while the list lasts', () => {
    const out = defaultRehearsalVoices(['A', 'B', 'C'], () => 'female');
    expect(out).toEqual({ A: 'coral', B: 'sage', C: 'ash' });
  });
});
