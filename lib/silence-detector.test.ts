import { describe, it, expect } from 'vitest';
import { SilenceDetector, type SilenceVerdict } from './silence-detector';

/** Drives the detector with [durationMs, voiced] segments; returns the ms at which it said stop, or null. */
function stopAt(detector: SilenceDetector, trace: [number, boolean][], frameMs = 16): number | null {
  let now = 0;
  detector.start(now);
  for (const [durationMs, voiced] of trace) {
    const end = now + durationMs;
    while (now < end) {
      now += frameMs;
      const v: SilenceVerdict = detector.frame(now, voiced);
      if (v === 'stop') return now;
    }
  }
  return null;
}

describe('SilenceDetector', () => {
  it('keeps recording through an unbroken quiet room until the blind arm', () => {
    const at = stopAt(new SilenceDetector(), [[20000, false]]);
    // blindArmAfterMs (10000) + silenceTimeoutMs (3500), within a frame.
    expect(at).toBeGreaterThanOrEqual(13500);
    expect(at).toBeLessThan(13600);
  });

  it('ends the take after the silence timeout once real speech has been heard', () => {
    const at = stopAt(new SilenceDetector(), [[500, false], [1500, true], [5000, false]]);
    expect(at).toBeGreaterThanOrEqual(2000 + 3500);
    expect(at).toBeLessThan(2000 + 3600);
  });

  it('does not arm on a transient shorter than the arming run', () => {
    const at = stopAt(new SilenceDetector(), [[500, false], [150, true], [8000, false]]);
    // Never armed by speech, so it waits for the blind arm instead of the 3.5s timeout.
    expect(at).toBeNull();
  });

  it('never stops while the room is continuously voiced before the cap', () => {
    const at = stopAt(new SilenceDetector(), [[60000, true]]);
    expect(at).toBeNull();
  });

  it('reports whether measured speech started the take', () => {
    const d = new SilenceDetector();
    stopAt(d, [[1000, true]]);
    expect(d.heardSpeech).toBe(true);
    expect(d.capturedVoicedMs).toBeGreaterThanOrEqual(1000 - 16);
  });
});
