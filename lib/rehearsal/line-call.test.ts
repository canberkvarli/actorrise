import { describe, expect, it } from 'vitest';
import { splitCalls } from './line-call';
import { tokenize } from '../word-match';

const split = (t: string, next: string | undefined, quietAt: number, known = new Set<number>()) =>
  splitCalls(tokenize(t), next, quietAt, known);

describe('splitCalls', () => {
  it('"line" after a stop is a call, taken out of the reading', () => {
    const s = split('get in the car line', 'drive', 4);
    expect([...s.calls]).toEqual([4]);
    expect(s.spoken).toBe('get in the car');
    expect(s.waiting).toBe(true);
  });

  it('"line please" is one call', () => {
    const s = split('line please', 'get', 0);
    expect(s.calls.size).toBe(1);
    expect(s.spoken).toBe('');
  });

  it('read straight through, "line" is a word of the line', () => {
    expect(split('draw the line here', 'line', 2).calls.size).toBe(0);
    expect(split('draw the line here', 'here', 0).calls.size).toBe(0); // no stop before it
  });

  it('where the script says "line", saying it is reading it', () => {
    expect(split('the line', 'line', 1).calls.size).toBe(0);
  });

  it('a call stays one through a revision, and the actor carrying on is no longer waiting', () => {
    const first = split('get in the car line', 'drive', 4);
    const s = split("get in the car line I'll drive", 'drive', 4, first.calls);
    expect(s.calls.size).toBe(1);
    expect(s.spoken).toBe(['get', 'in', 'the', 'car', ...tokenize("I'll drive")].join(' '));
    expect(s.waiting).toBe(false);
  });

  it('a mishearing still calls', () => {
    expect(split('lion', 'get', 0).calls.size).toBe(1);
  });
});
