/**
 * The sound of an air: a low drone (a root and its fifth, slightly detuned) and
 * a filtered hiss, wavering a little. Made in Web Audio, no files. It only
 * starts on a tap (browsers require one) and is off until the actor turns it on.
 */

import type { Air } from "@/lib/studio/air";

export class AirSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private a!: OscillatorNode;
  private b!: OscillatorNode;
  private hiss!: BiquadFilterNode;
  private hissGain!: GainNode;
  private lfo!: OscillatorNode;
  private lfoDepth!: GainNode;

  start(air: Air): void {
    if (this.ctx) return this.set(air);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(0.14, now + 1.8);
    this.master.connect(ctx.destination);

    const tone = ctx.createGain();
    tone.gain.value = 0.5;
    tone.connect(this.master);
    this.a = ctx.createOscillator();
    this.a.type = "sine";
    this.b = ctx.createOscillator();
    this.b.type = "triangle";
    this.b.detune.value = 7;
    const bGain = ctx.createGain();
    bGain.gain.value = 0.35;
    this.a.connect(tone);
    this.b.connect(bGain).connect(tone);

    // The waver: a slow wobble on pitch.
    this.lfo = ctx.createOscillator();
    this.lfoDepth = ctx.createGain();
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.a.frequency);
    this.lfoDepth.connect(this.b.frequency);

    // The hiss: two seconds of noise, looped, through a band-pass.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.hiss = ctx.createBiquadFilter();
    this.hiss.type = "bandpass";
    this.hiss.Q.value = 0.8;
    this.hissGain = ctx.createGain();
    noise.connect(this.hiss).connect(this.hissGain).connect(this.master);

    this.set(air, 0.01);
    this.a.start();
    this.b.start();
    this.lfo.start();
    noise.start();
  }

  /** Glide to an air over `secs`. */
  set(air: Air, secs = 2.2): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const glide = (p: AudioParam, v: number) => {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(v, t + secs);
    };
    glide(this.a.frequency, air.tone.root);
    glide(this.b.frequency, air.tone.root * 1.5);
    glide(this.hiss.frequency, air.tone.hiss);
    glide(this.hissGain.gain, 0.05 + air.unrest * 0.18);
    glide(this.lfo.frequency, 0.08 + air.tone.waver * 1.6);
    glide(this.lfoDepth.gain, air.tone.root * 0.01 * (0.3 + air.tone.waver * 2));
  }

  stop(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.ctx = null;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => void ctx.close(), 800);
  }
}
