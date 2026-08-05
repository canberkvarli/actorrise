/**
 * Decides when a spoken take has ended.
 *
 * Split out of useWhisperSTT so the decision is pure and testable — the hook
 * only feeds it analyser peaks and acts on the verdict.
 *
 * The old inline version armed its silence timer the instant ANY frame crossed
 * the threshold, then stopped the take 2s later. A single stray frame — the tail
 * of the AI partner's line bleeding through the speakers, a chair creak, a breath
 * before the first word — was enough to arm it, so takes were being cut before the
 * actor had said anything, or mid-line when they paused to read ahead. Whisper then
 * hallucinated words out of ~2s of room tone ("what not me too hot").
 *
 * Two guards fix that:
 *   - arming needs a CONTINUOUS run of voiced frames, so transients don't count
 *   - the take must hold a minimum of voiced audio before silence may end it
 */

export interface SilenceDetectorOptions {
  /** Frequency-domain peak (0–255) at or above which a frame counts as voiced. */
  threshold?: number;
  /** Continuous silence that ends the take, once the speaker has actually started. */
  silenceTimeoutMs?: number;
  /** Voiced audio must run this long UNBROKEN before the speaker counts as started. */
  armAfterVoicedMs?: number;
  /** A take needs at least this much voiced audio before silence is allowed to end it. */
  minVoicedMs?: number;
  /** Silence this long ends the take even if minVoicedMs was never reached. */
  giveUpSilenceMs?: number;
  /** The analyser never saw speech by now — arm anyway (mics that don't register). */
  blindArmAfterMs?: number;
  /** Hard ceiling. A take can never run longer than this. */
  maxDurationMs?: number;
}

export type SilenceVerdict = 'recording' | 'stop';

const DEFAULTS: Required<SilenceDetectorOptions> = {
  threshold: 10,
  silenceTimeoutMs: 3500,
  armAfterVoicedMs: 300,
  minVoicedMs: 700,
  giveUpSilenceMs: 9000,
  blindArmAfterMs: 10000,
  maxDurationMs: 90000,
};

export class SilenceDetector {
  private readonly opts: Required<SilenceDetectorOptions>;
  private startedAt = 0;
  private lastFrameAt = 0;
  /** Total voiced audio in the take. */
  private voicedMs = 0;
  /** Length of the current unbroken voiced run — resets on every silent frame. */
  private voicedRunMs = 0;
  private silenceStartedAt: number | null = null;
  private armed = false;
  /** True when arming came from the timeout rather than from measured speech. */
  private armedBlind = false;

  constructor(options: SilenceDetectorOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Begins a take. `now` is a millisecond clock (Date.now or performance.now). */
  start(now: number): void {
    this.startedAt = now;
    this.lastFrameAt = now;
    this.voicedMs = 0;
    this.voicedRunMs = 0;
    this.silenceStartedAt = null;
    this.armed = false;
    this.armedBlind = false;
  }

  /**
   * Feeds one analyser frame.
   * @param peak Loudest frequency bin this frame (0–255).
   * @returns whether the take should keep running or stop now.
   */
  frame(now: number, peak: number): SilenceVerdict {
    const delta = Math.max(0, now - this.lastFrameAt);
    this.lastFrameAt = now;

    if (now - this.startedAt >= this.opts.maxDurationMs) return 'stop';

    if (peak >= this.opts.threshold) {
      this.voicedMs += delta;
      this.voicedRunMs += delta;
      this.silenceStartedAt = null;
      // A sustained run means the speaker is genuinely going — not a stray transient.
      if (this.voicedRunMs >= this.opts.armAfterVoicedMs) this.armed = true;
      return 'recording';
    }

    this.voicedRunMs = 0;

    // The analyser has heard nothing usable for a long time. Some mics never
    // register here, so arm regardless or the take would never end on its own.
    if (!this.armed && now - this.startedAt >= this.opts.blindArmAfterMs) {
      this.armed = true;
      this.armedBlind = true;
    }

    if (!this.armed) return 'recording';

    if (this.silenceStartedAt === null) {
      this.silenceStartedAt = now;
      return 'recording';
    }

    const silentFor = now - this.silenceStartedAt;

    // Waited long enough that nothing more is coming, whatever we captured.
    if (silentFor >= this.opts.giveUpSilenceMs) return 'stop';

    if (silentFor < this.opts.silenceTimeoutMs) return 'recording';

    // Blind arming can't measure voiced audio, so the minimum doesn't apply.
    if (!this.armedBlind && this.voicedMs < this.opts.minVoicedMs) return 'recording';

    return 'stop';
  }

  /** Voiced audio captured so far, for callers that want to reject empty takes. */
  get capturedVoicedMs(): number {
    return this.voicedMs;
  }

  /** Whether measured speech (not the blind timeout) started this take. */
  get heardSpeech(): boolean {
    return this.armed && !this.armedBlind;
  }
}
