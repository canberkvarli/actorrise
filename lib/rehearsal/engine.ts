/**
 * The rehearsal engine. Pure: every clock, speaker, microphone and network it
 * touches is a port handed in, so this file runs under vitest with none of
 * them. The React layer renders `snapshot()` and forwards inputs. It never
 * decides anything.
 *
 * Time is the audio clock, in seconds. A partner beat is scheduled on it to
 * the sample; the microphone opens at the beat's exact end; the handover
 * fires on the delta that completes the actor's line, not after a wait.
 */
import { liveRead, shouldHandOver, type LiveRead, EMPTY_READ } from '../live-read';
import type { EventType } from './contract';
import type { ActorTurn, PartnerTurn, Script } from './script';
import { Timeline } from './timeline';

/** The pause between two partner lines in one beat. */
export const BREATH_S = 0.3;

export interface EnginePorts {
  clock: { now: () => number; outputLatency: () => number };
  player: {
    /** Decoded length in seconds, or null if the line is not ready yet. */
    duration: (lineIndex: number) => number | null;
    /** Schedule the line at `at` on the audio clock. */
    play: (lineIndex: number, at: number) => boolean;
    stopAll: () => void;
  };
  mic: {
    /** Tell the transcriber what is coming. Sent when the partner starts. */
    prime: (keywords: string[]) => void;
    open: () => void;
    close: () => void;
  };
  journal: { emit: (type: EventType, lineIndex: number | null, atMs: number, payload?: Record<string, unknown>) => void };
  /** Run `fn` when the audio clock reaches `at`. Returns a cancel. */
  schedule: (at: number, fn: () => void) => () => void;
}

export type EngineState = 'ready' | 'partner' | 'actor' | 'paused' | 'ended';

export interface Snapshot {
  state: EngineState;
  /** The character the actor is reading. */
  actor: string;
  turnIndex: number;
  /** The line the actor is on, or the partner line currently sounding. */
  lineIndex: number;
  read: LiveRead;
  /** Which partner line in the current beat is sounding, by line index. */
  sounding: number | null;
  /** Lines the actor has already read, index → matched word indices. */
  heard: Map<number, Set<number>>;
}

export class Engine {
  private state: EngineState = 'ready';
  private turnIndex = 0;
  private read: LiveRead = EMPTY_READ;
  private sounding: number | null = null;
  private heard = new Map<number, Set<number>>();
  private cancels: Array<() => void> = [];
  private startedAt = 0;
  private timeline = new Timeline();
  /** A cold partner line the beat is holding on: its position in the beat and when it was due. */
  private waiting: { line: number; position: number; due: number } | null = null;
  private listeners = new Set<() => void>();

  constructor(private script: Script, private ports: EnginePorts) {}

  // ── reading ──

  snapshot(): Snapshot {
    const turn = this.script.turns[this.turnIndex];
    const lineIndex = turn ? (turn.kind === 'actor' ? turn.lineIndex : (this.sounding ?? turn.lineIndices[0])) : -1;
    return {
      state: this.state, actor: this.script.actor, turnIndex: this.turnIndex, lineIndex,
      read: this.read, sounding: this.sounding, heard: this.heard,
    };
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.listeners.forEach(fn => fn()); }

  private atMs() { return (this.ports.clock.now() - this.startedAt) * 1000; }

  // ── inputs from the actor ──

  begin() {
    if (this.state !== 'ready') return;
    this.startedAt = this.ports.clock.now();
    this.ports.journal.emit('started', null, 0);
    this.enter(0);
  }

  /** Audio stopped at the clock, mic off. The turn index is what resume returns to. */
  pause() {
    if (this.state !== 'partner' && this.state !== 'actor') return;
    this.silence();
    this.state = 'paused';
    this.ports.journal.emit('paused', this.snapshot().lineIndex, this.atMs());
    this.changed();
  }

  /** The same turn again, from its start. */
  resume() {
    if (this.state !== 'paused') return;
    this.ports.journal.emit('resumed', this.snapshot().lineIndex, this.atMs());
    this.enter(this.turnIndex);
  }

  skip() {
    if (this.state !== 'actor') return;
    this.finishActorTurn('skipped');
  }

  back() {
    if (this.state === 'ended' || this.state === 'ready') return;
    let i = this.turnIndex - 1;
    while (i >= 0 && this.script.turns[i].kind !== 'actor') i--;
    this.jumpToTurn(Math.max(i, 0));
  }

  jumpTo(lineIndex: number) {
    if (this.state === 'ready') return;
    const t = this.script.turnOfLine[lineIndex];
    if (t === undefined) return;
    this.jumpToTurn(t);
  }

  abandon() {
    if (this.state === 'ended' || this.state === 'ready') return;
    this.silence();
    this.ports.journal.emit('abandoned', this.snapshot().lineIndex, this.atMs());
    this.state = 'ended';
    this.changed();
  }

  private jumpToTurn(t: number) {
    const from = this.snapshot().lineIndex;
    this.silence();
    this.ports.journal.emit('jumped', this.lineOfTurn(t), this.atMs(), { from });
    this.enter(t);
  }

  // ── inputs from the transcriber ──

  delta(transcript: string) {
    if (this.state !== 'actor') return; // partner bleed, or a paused mic
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    const now = this.ports.clock.now();
    this.timeline.mark('delta', now);
    if (this.timeline.get('first_delta') === undefined) this.timeline.mark('first_delta', now);
    this.read = liveRead(turn.words, transcript);
    if (shouldHandOver({ ...this.read, turnEnded: false })) {
      this.finishActorTurn('last_word');
      return;
    }
    this.changed();
  }

  /** The transcript has stopped growing (QUIET_AFTER_WORDS_MS). */
  quiet() {
    if (this.state !== 'actor') return;
    if (shouldHandOver({ ...this.read, turnEnded: true })) this.finishActorTurn('quiet');
  }

  /** A partner line the engine was holding on has decoded: the beat goes on from it. */
  audioReady(lineIndex: number) {
    if (this.state !== 'partner' || this.waiting?.line !== lineIndex) return;
    const { position, due } = this.waiting;
    this.waiting = null;
    this.playBeat(this.script.turns[this.turnIndex] as PartnerTurn, position, Math.max(due, this.ports.clock.now()));
    this.changed();
  }

  // ── transitions ──

  private lineOfTurn(t: number) {
    const turn = this.script.turns[t];
    return turn.kind === 'actor' ? turn.lineIndex : turn.lineIndices[0];
  }

  private silence() {
    this.clearTimers();
    this.ports.player.stopAll();
    this.ports.mic.close();
  }

  private enter(t: number) {
    this.clearTimers();
    const turn = this.script.turns[t];
    if (!turn) { this.end(); return; } // past the last turn; the snapshot stays on it
    this.turnIndex = t;
    this.read = EMPTY_READ;
    this.sounding = null;
    this.waiting = null;
    this.timeline.reset();
    if (turn.kind === 'partner') {
      this.state = 'partner';
      this.ports.journal.emit('line_reached', turn.lineIndices[0], this.atMs());
      this.playBeat(turn, 0, this.ports.clock.now());
      // Primed as the beat starts (after play, so it never delays the sound),
      // so the transcriber is ready when the mic opens.
      const next = this.script.turns[t + 1];
      if (next?.kind === 'actor') this.ports.mic.prime(next.keywords);
    } else {
      this.state = 'actor';
      this.ports.mic.prime(turn.keywords);
      this.ports.mic.open();
      this.timeline.mark('mic_open', this.ports.clock.now());
      this.ports.journal.emit('line_reached', turn.lineIndex, this.atMs());
    }
    this.changed();
  }

  /**
   * Schedule the beat from `position` on, starting at `at`: each line follows
   * the last by its decoded length plus a breath, and the mic opens at the
   * last line's end, on the clock. A cold line holds the beat there.
   */
  private playBeat(turn: PartnerTurn, position: number, at: number) {
    let start = at;
    let end = at;
    for (let p = position; p < turn.lineIndices.length; p++) {
      const line = turn.lineIndices[p];
      const d = this.ports.player.duration(line);
      if (d === null) {
        this.waiting = { line, position: p, due: start };
        return;
      }
      this.ports.player.play(line, start);
      const s = start;
      this.cancels.push(this.ports.schedule(s, () => { this.sounding = line; this.changed(); }));
      this.ports.journal.emit('partner_line_played', line, (s - this.startedAt) * 1000);
      end = s + d;
      start = end + BREATH_S;
    }
    this.timeline.mark('partner_end', end);
    this.cancels.push(this.ports.schedule(end, () => this.enter(this.turnIndex + 1)));
  }

  private finishActorTurn(endedBy: 'last_word' | 'quiet' | 'skipped') {
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    const now = this.ports.clock.now();
    this.ports.mic.close();
    const next = this.script.turns[this.turnIndex + 1];
    this.timeline.mark('handover', now);
    // The next beat is scheduled at `now` by enter() below, in this same call.
    if (next?.kind === 'partner' && this.ports.player.duration(next.lineIndices[0]) !== null) {
      this.timeline.mark('partner_scheduled', now);
    }
    this.heard.set(turn.lineIndex, new Set(this.read.matched));
    this.ports.journal.emit('actor_line_read', turn.lineIndex, this.atMs(), {
      ended_by: endedBy,
      matched: [...this.read.matched].sort((a, b) => a - b),
      score: this.read.score,
      // null when nothing was measured (a skip with no delta, a cold partner line).
      handover_ms: this.timeline.handoverMs(),
      output_latency_ms: Math.round(this.ports.clock.outputLatency() * 1000),
    });
    this.enter(this.turnIndex + 1);
  }

  private end() {
    this.clearTimers();
    this.ports.mic.close();
    this.state = 'ended';
    this.ports.journal.emit('completed', this.script.lines.length - 1, this.atMs(), {});
    this.changed();
  }

  private clearTimers() { this.cancels.forEach(c => c()); this.cancels = []; }
}
