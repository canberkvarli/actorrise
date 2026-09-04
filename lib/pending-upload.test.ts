import { describe, it, expect } from 'vitest';
import { isExpired, PENDING_TTL_MS } from './pending-upload';

describe('pending upload expiry', () => {
  const saved = 1_700_000_000_000;

  it('keeps a script saved a moment ago', () => {
    expect(isExpired(saved, saved + 1000)).toBe(false);
  });

  it('keeps a script overnight, which is the point of storing it at all', () => {
    // Upload at midnight, decide about Plus over breakfast.
    expect(isExpired(saved, saved + 12 * 60 * 60 * 1000)).toBe(false);
  });

  it('keeps it right up to the deadline', () => {
    expect(isExpired(saved, saved + PENDING_TTL_MS - 1)).toBe(false);
  });

  it('drops it once the window has passed', () => {
    expect(isExpired(saved, saved + PENDING_TTL_MS)).toBe(true);
  });

  it('drops a script abandoned months ago', () => {
    expect(isExpired(saved, saved + 90 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it('does not treat a clock that went backwards as expired', () => {
    // A device whose clock is corrected backwards should keep the file, not
    // silently bin it.
    expect(isExpired(saved, saved - 60_000)).toBe(false);
  });
});
