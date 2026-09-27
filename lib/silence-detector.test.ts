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

describe('SilenceDetector: flicker after speech', () => {
  /** Speech, then silence broken every 500ms by one 16ms voiced frame. */
  function flicker(silentMs: number, frameMs = 16): [number, boolean][] {
    const out: [number, boolean][] = [];
    let t = 0;
    while (t < silentMs) {
      out.push([500 - frameMs, false]);
      out.push([frameMs, true]);
      t += 500;
    }
    return out;
  }

  it('does not let a lone voiced frame restart the silence clock', () => {
    // Session 409: two seconds of speech, then a 26-second take that never
    // ended because the room flickered voiced once in a while.
    const at = stopAt(new SilenceDetector(), [[300, false], [2000, true], ...flicker(12000)]);
    expect(at).not.toBeNull();
    expect(at!).toBeLessThan(2300 + 3500 + 600);
  });

  it('still hears the speaker come back after a pause', () => {
    // A 1.2s pause mid-line, then a second sentence: the take must not end
    // until 3.5s after the SECOND sentence.
    const at = stopAt(new SilenceDetector(), [[300, false], [1500, true], [1200, false], [1500, true], [5000, false]]);
    expect(at).toBeGreaterThanOrEqual(4500 + 3500);
    expect(at).toBeLessThan(4500 + 3600);
  });

  it('counts a voiced return only once it has run for resumeAfterVoicedMs', () => {
    // 100ms of voice inside silence is under the 120ms bar: the clock keeps
    // running and the take ends on the original schedule.
    const at = stopAt(new SilenceDetector(), [[300, false], [1500, true], [2000, false], [96, true], [5000, false]]);
    expect(at).toBeGreaterThanOrEqual(1800 + 3500);
    expect(at).toBeLessThan(1800 + 3600);
  });
});
