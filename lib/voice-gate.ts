/**
 * Is the actor making sound right now?
 *
 * The rule this replaces compared the loudest analyser bin against a fixed
 * byte threshold of 10, which is about -97 dBFS: digital silence. A MacBook in
 * a quiet room with auto gain on reads around 140–190 on that scale, so every
 * frame counted as voice, the take could never see silence, the recording ran
 * to its 90-second cap, Whisper never got a turn, and the advance rule's quiet
 * guard never opened. That is the "stuck on Recording" rehearsal.
 *
 * There is no absolute level that means "voice" on real hardware. What is
 * stable is the CONTRAST: speech sits well above whatever the room is doing.
 * So this tracks the room and asks for a margin over it.
 *
 * The floor follows the level with an asymmetric slew. Down is fast, so the
 * first quiet moment after the partner's audio tail resets it. Up is slower
 * and only really moves between words, so a line never becomes its own floor;
 * but it does still creep during sustained sound, because a flat tone that
 * counts as voice for ever is the one shape that would wedge a take open (auto
 * gain stepping up between lines does exactly that).
 *
 * One gate lives for the whole session: rooms don't change between lines, and
 * a fresh AnalyserNode spends its first ~200ms ramping up from -Infinity, which
 * must not be mistaken for the room going silent. `resume()` rides that out.
 *
 * Kept pure so lib/voice-gate.test.ts can pin it without a microphone.
 */

export interface VoiceGateOptions {
  /** How far above the tracked room level a frame must sit to count as voice. */
  marginDb?: number;
  /** How fast the floor may climb while the frame is NOT voice (room getting louder). */
  floorRiseDbPerSec?: number;
  /** How fast the floor may climb while the frame IS voice (sustained sound, see above). */
  floorCreepDbPerSec?: number;
  /** How fast the floor may fall (the room going quiet). */
  floorFallDbPerSec?: number;
  /** Frames this soon after start/resume are ignored while the analyser settles. */
  warmupMs?: number;
  /**
   * Nothing below this counts as voice, however quiet the floor. A muted or
   * missing microphone reads near -100 and must not be "spoken over" by noise.
   */
  minVoiceDb?: number;
}

const DEFAULTS: Required<VoiceGateOptions> = {
  marginDb: 10,
  floorRiseDbPerSec: 6,
  floorCreepDbPerSec: 1,
  floorFallDbPerSec: 40,
  warmupMs: 250,
  minVoiceDb: -70,
};

/** Level to assume when the analyser reports -Infinity (a fully silent frame). */
const SILENT_DB = -120;

export class VoiceGate {
  private readonly opts: Required<VoiceGateOptions>;
  private floor = Number.NaN;
  private lastAt = 0;
  private warmUntil = 0;

  constructor(options: VoiceGateOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Forgets the room and begins again. `now` is a millisecond clock. */
  start(now: number): void {
    this.floor = Number.NaN;
    this.resume(now);
  }

  /** A new take in the same room: keeps the floor, ignores the analyser warm-up. */
  resume(now: number): void {
    this.lastAt = now;
    this.warmUntil = now + this.opts.warmupMs;
  }

  /**
   * Feeds one frame.
   * @param levelDb Speech-band level this frame, in dB (any consistent scale).
   * @returns whether this frame counts as voice.
   */
  frame(now: number, levelDb: number): boolean {
    const dt = Math.max(0, now - this.lastAt) / 1000;
    this.lastAt = now;
    if (now < this.warmUntil) return false;

    const level = Number.isFinite(levelDb) ? levelDb : SILENT_DB;

    // The first settled frame is the room. The take starts before the actor speaks.
    if (Number.isNaN(this.floor)) {
      this.floor = level;
      return false;
    }

    const voiced = level >= this.floor + this.opts.marginDb && level >= this.opts.minVoiceDb;

    if (level < this.floor) {
      this.floor = Math.max(level, this.floor - this.opts.floorFallDbPerSec * dt);
    } else {
      const rate = voiced ? this.opts.floorCreepDbPerSec : this.opts.floorRiseDbPerSec;
      this.floor = Math.min(level, this.floor + rate * dt);
    }
    return voiced;
  }

  /** The room level the gate is currently measuring against. */
  get noiseFloorDb(): number {
    return this.floor;
  }
}

/**
 * Speech-band level from an AnalyserNode, in dB.
 *
 * The loudest FFT bin between 300 Hz and 3.4 kHz, where voices live, so a
 * fan, a rumble or a hand on the case (all below 300 Hz) moves nothing here.
 * The peak rather than the band average: measured on a laptop, a spoken line
 * sits about 20 dB over the room on the peak and only 12 dB on the average,
 * because most bins in the band stay quiet even mid-word. Pass a scratch
 * buffer sized to `analyser.frequencyBinCount` so nothing is allocated per
 * frame.
 */
export function speechBandLevelDb(
  analyser: AnalyserNode,
  scratch: Float32Array<ArrayBuffer>,
  sampleRate: number,
): number {
  analyser.getFloatFrequencyData(scratch);
  const binHz = sampleRate / analyser.fftSize;
  const lo = Math.max(1, Math.round(300 / binHz));
  const hi = Math.min(scratch.length - 1, Math.round(3400 / binHz));
  let peak = SILENT_DB;
  for (let i = lo; i <= hi; i++) {
    const v = scratch[i];
    if (Number.isFinite(v) && v > peak) peak = v;
  }
  return peak;
}
