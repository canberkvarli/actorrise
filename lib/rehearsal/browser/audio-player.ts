/**
 * One AudioContext for the run. Decodes partner lines into buffers and
 * schedules them on the context clock, which is the clock the engine uses
 * for everything. Nothing is fetched or decoded at play time.
 *
 * iOS: the context must be created or resumed inside the Begin tap, and it
 * is interrupted when the phone locks; `onInterrupted` lets the hook pause.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private buffers = new Map<number, AudioBuffer>();
  private sources = new Set<AudioBufferSourceNode>();
  onInterrupted: (() => void) | null = null;

  /** The one place a context is made, so the interruption listener is always on it. */
  private create(): AudioContext {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.addEventListener('statechange', () => {
      if (this.ctx === ctx && ctx.state !== 'running') this.onInterrupted?.();
    });
    return ctx;
  }

  /** Call from a user gesture. */
  unlock(): AudioContext {
    const ctx = this.context();
    if (ctx.state !== 'running') void ctx.resume();
    return ctx;
  }

  context(): AudioContext {
    if (!this.ctx) this.ctx = this.create();
    return this.ctx;
  }

  now() { return this.context().currentTime; }
  /** Safari reports outputLatency as 0; baseLatency is the honest floor then. */
  outputLatency() { const c = this.context(); return c.outputLatency || c.baseLatency || 0; }

  async decode(lineIndex: number, bytes: ArrayBuffer) {
    const buf = await this.context().decodeAudioData(bytes.slice(0));
    this.buffers.set(lineIndex, buf);
  }

  has(lineIndex: number) { return this.buffers.has(lineIndex); }
  duration(lineIndex: number) { return this.buffers.get(lineIndex)?.duration ?? null; }

  play(lineIndex: number, at: number): boolean {
    const buf = this.buffers.get(lineIndex);
    if (!buf) return false;
    const ctx = this.context();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(Math.max(at, ctx.currentTime));
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); src.disconnect(); };
    return true;
  }

  stopAll() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already done */ } }
    this.sources.clear();
  }

  /** Run `fn` when the clock reaches `at`. setTimeout against the audio clock,
   *  re-checked so a late timer never fires early. */
  schedule(at: number, fn: () => void): () => void {
    let handle: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      const ms = Math.max(0, (at - this.now()) * 1000);
      handle = setTimeout(() => { if (this.now() + 0.002 >= at) fn(); else arm(); }, ms);
    };
    arm();
    return () => { if (handle) clearTimeout(handle); };
  }

  close() { this.stopAll(); void this.ctx?.close(); this.ctx = null; this.buffers.clear(); }
}
