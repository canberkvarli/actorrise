import { describe, it, expect } from 'vitest';
import { VoiceGate } from './voice-gate';

/**
 * Feeds a level trace at a fixed frame rate. Each entry is [durationMs, levelDb];
 * the result holds one array of per-frame verdicts per entry.
 */
function run(gate: VoiceGate, trace: [number, number][], frameMs = 16, from = 0): boolean[][] {
  const out: boolean[][] = [];
  let now = from;
  for (const [durationMs, levelDb] of trace) {
    const end = now + durationMs;
    const seg: boolean[] = [];
    while (now < end) {
      now += frameMs;
      seg.push(gate.frame(now, levelDb));
    }
    out.push(seg);
  }
  return out;
}

function fresh(trace: [number, number][]): boolean[][] {
  const gate = new VoiceGate();
  gate.start(0);
  return run(gate, trace);
}

const count = (frames: boolean[]) => frames.filter(Boolean).length;
const all = (frames: boolean[]) => frames.length > 0 && frames.every(Boolean);
const none = (frames: boolean[]) => count(frames) === 0;

describe('VoiceGate', () => {
  it('never hears voice in steady room tone, however loud the room is', () => {
    // A MacBook in a quiet room measured about -35 dBFS in the speech band
    // with auto gain on. The old absolute threshold called that speech.
    for (const room of [-90, -60, -45, -35, -28]) {
      const [seg] = fresh([[5000, room]]);
      expect(none(seg), `room at ${room} dB`).toBe(true);
    }
  });

  it('ignores the analyser warming up: the first frames read as digital silence', () => {
    // A fresh AnalyserNode with smoothing ramps up from -Infinity over the
    // first ~200ms. Seeding the floor from those frames put it at -120 and
    // made the whole room count as voice for seconds afterwards.
    const [, room] = fresh([[200, -120], [3000, -66]]);
    expect(none(room)).toBe(true);
  });

  it('hears speech that rises above the room, and stops when it stops', () => {
    const [before, during, after] = fresh([
      [500, -60], // room
      [1000, -30], // a line
      [1500, -60], // room again
    ]);
    expect(none(before)).toBe(true);
    expect(all(during)).toBe(true);
    expect(none(after)).toBe(true);
  });

  it('still hears speech in a loud room with auto gain squashing the range', () => {
    // Auto gain on a laptop: room tone around -35, speech around -22.
    const [, during, after] = fresh([[500, -35], [800, -22], [800, -35]]);
    expect(all(during)).toBe(true);
    expect(none(after)).toBe(true);
  });

  it('keeps hearing a long speech, because the floor only follows the dips between words', () => {
    const trace: [number, number][] = [[500, -60]];
    for (let i = 0; i < 12; i++) trace.push([700, -30], [120, -50]);
    const segs = fresh(trace);
    const words = segs.filter((_, i) => i > 0 && i % 2 === 1);
    expect(words.every(all)).toBe(true);
  });

  it('follows a room that slowly gets louder without calling it speech', () => {
    // A fan spinning up: 1 dB per second for 20 seconds.
    const trace: [number, number][] = [];
    for (let s = 0; s < 20; s++) trace.push([1000, -60 + s]);
    expect(fresh(trace).every(none)).toBe(true);
  });

  it('recovers from a sudden step in room tone within a few seconds', () => {
    // Auto gain pumping up between lines: the floor jumps and holds. This is
    // the one shape that must never wedge the take open: a flat tone that is
    // "voice" for ever.
    for (const step of [8, 12]) {
      const [, afterStep] = fresh([[1000, -45], [10000, -45 + step]]);
      expect(count(afterStep) * 16, `step of ${step} dB`).toBeLessThan(5000);
      expect(none(afterStep.slice(-Math.floor(2000 / 16)))).toBe(true);
    }
  });

  it('drops the floor fast when the room goes quiet', () => {
    // The take opened on the partner's audio tail, then the room went silent
    // and the actor spoke. Speech must count even though the seed was loud.
    const [, , speech] = fresh([[400, -30], [500, -60], [800, -30]]);
    expect(all(speech)).toBe(true);
  });

  it('treats digital silence as no microphone, not as a quiet room to speak over', () => {
    // A muted or absent mic reads -Infinity / -100. A blip to -85 is not a voice.
    expect(fresh([[1000, -100], [1000, -85]]).every(none)).toBe(true);
  });

  it('carries the room across takes and rides out the next warm-up', () => {
    const gate = new VoiceGate();
    gate.start(0);
    run(gate, [[2000, -60]]);
    const settled = gate.noiseFloorDb;
    // Next take: a fresh analyser ramps up from silence, then the actor comes
    // in almost at once. The floor must not have been dragged down by the ramp.
    gate.resume(10_000);
    const [ramp, speech, room] = run(gate, [[300, -120], [600, -40], [1000, -60]], 16, 10_000);
    expect(none(ramp)).toBe(true);
    expect(all(speech)).toBe(true);
    expect(none(room)).toBe(true);
    expect(gate.noiseFloorDb).toBeCloseTo(settled, 0);
  });

  it('lets a caller read the floor it settled on', () => {
    const gate = new VoiceGate();
    gate.start(0);
    run(gate, [[2000, -52]]);
    expect(gate.noiseFloorDb).toBeCloseTo(-52, 0);
  });
});
