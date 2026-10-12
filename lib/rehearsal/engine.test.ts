import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BREATH_S, Engine, type EnginePorts } from './engine';
import { buildScript } from './script';
import type { RehearsalLine } from './contract';
import { liveRead } from '../live-read';

const L = (index: number, character: string, text: string): RehearsalLine => ({ index, character, text, direction: null });
const LINES = [L(0, 'BEN', 'Where were you?'), L(1, 'BEN', 'I waited.'), L(2, 'ANNA', 'Out. Twenty-four hours.'),
  L(3, 'BEN', 'Fine.'), L(4, 'ANNA', 'Go.')];

/** Callbacks handed to `schedule`, fired by `fire(upTo)` once the clock is at or past their time. */
let timers: { at: number; fn: () => void }[] = [];
const fire = (upTo: number) => { const due = timers.filter(t => t.at <= upTo); timers = timers.filter(t => t.at > upTo); due.forEach(t => t.fn()); };

function fakePorts() {
  let now = 100;
  const scheduled: { line: number; at: number }[] = [];
  const durations: Record<number, number> = { 0: 1.0, 1: 0.5, 3: 0.4 };
  const ports: EnginePorts & { now: () => number; tick: (s: number) => void; scheduled: typeof scheduled } = {
    now: () => now,
    tick: (s) => { now += s; },
    scheduled,
    clock: { now: () => now, outputLatency: () => 0.02 },
    player: {
      duration: (line) => durations[line] ?? null,
      play: (line, at) => { scheduled.push({ line, at }); return true; },
      stopAll: vi.fn(),
    },
    mic: { prime: vi.fn(), open: vi.fn(), close: vi.fn() },
    journal: { emit: vi.fn() },
    schedule: vi.fn((at: number, fn: () => void) => { timers.push({ at, fn }); return () => {}; }),
  };
  return ports;
}

describe('Engine', () => {
  let ports: ReturnType<typeof fakePorts>;
  let engine: Engine;
  beforeEach(() => { timers = []; ports = fakePorts(); engine = new Engine(buildScript(LINES, 'ANNA'), ports); });

  it('begin plays the first beat as one continuous thing with a breath between lines', () => {
    engine.begin();
    expect(ports.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
    expect(engine.snapshot().state).toBe('partner');
  });

  it('opens the mic exactly at the end of the beat and primes it at the start', () => {
    engine.begin();
    expect(ports.mic.prime).toHaveBeenCalledWith(expect.arrayContaining(['Anna', 'Ben']));
    const end = 100 + 1.0 + BREATH_S + 0.5;
    expect(ports.mic.open).not.toHaveBeenCalled();
    ports.tick(end - 100); fire(end);
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().state).toBe('actor');
    expect(engine.snapshot().lineIndex).toBe(2);
  });

  it('hands over on the last word with no wait, and schedules the partner now', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    ports.tick(1); engine.delta('out twenty four');
    expect(engine.snapshot().state).toBe('actor');
    ports.tick(0.4); engine.delta('out twenty four hours');
    expect(ports.mic.close).toHaveBeenCalled();
    expect(ports.scheduled.at(-1)).toEqual({ line: 3, at: ports.now() });
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number),
      expect.objectContaining({ ended_by: 'last_word', matched: [0, 1, 2, 3], handover_ms: 0 }));
  });

  it('a delta before the mic is open is ignored', () => {
    engine.begin();
    engine.delta('out twenty four hours');
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.mic.close).not.toHaveBeenCalled();
  });

  it('quiet after some words hands over; quiet after nothing does not', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.quiet();
    expect(engine.snapshot().state).toBe('actor');
    engine.delta('out twenty');
    engine.quiet();
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'quiet' }));
  });

  it('the last actor line ends the scene', () => {
    engine.begin(); let t = 100 + 1.5 + BREATH_S; ports.tick(t - 100); fire(t);
    engine.delta('out twenty four hours');
    t = ports.now() + 0.4; ports.tick(0.4); fire(t);
    expect(engine.snapshot().state).toBe('actor'); expect(engine.snapshot().lineIndex).toBe(4);
    engine.delta('go');
    expect(engine.snapshot().state).toBe('ended');
    expect(ports.journal.emit).toHaveBeenCalledWith('completed', 4, expect.any(Number), {});
  });

  it('skip moves on with ended_by skipped; back returns to the previous actor line', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.skip();
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'skipped' }));
    expect(engine.snapshot().state).toBe('partner');
    engine.back();
    expect(engine.snapshot().lineIndex).toBe(2);
    expect(engine.snapshot().state).toBe('actor');
    expect(ports.player.stopAll).toHaveBeenCalled();
  });

  it('pause stops audio and the mic; resume restarts the current turn', () => {
    engine.begin();
    engine.pause();
    expect(engine.snapshot().state).toBe('paused');
    expect(ports.player.stopAll).toHaveBeenCalled();
    expect(ports.mic.close).toHaveBeenCalled();
    engine.resume();
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.scheduled.length).toBe(4); // first beat scheduled twice
  });

  it('jumpTo any line starts that turn', () => {
    engine.begin();
    engine.jumpTo(4);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 4 });
    expect(ports.journal.emit).toHaveBeenCalledWith('jumped', 4, expect.any(Number), { from: 0 });
  });

  it('a partner line whose audio is missing waits for it, then plays', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: null, 1: 0.5 };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    expect(p.scheduled).toEqual([]);
    expect(e.snapshot().state).toBe('partner');
    dur[0] = 1.0; e.audioReady(0);
    expect(p.scheduled[0]).toEqual({ line: 0, at: p.now() });
  });

  it('a cold line mid-beat holds there and goes on from that line, not from the top', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: 1.0, 1: null };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    expect(p.scheduled).toEqual([{ line: 0, at: 100 }]);
    p.tick(0.2); dur[1] = 0.5; e.audioReady(1);
    expect(p.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
  });

  it('snapshot names the actor', () => {
    expect(engine.snapshot().actor).toBe('ANNA');
  });

  it('aligning a 200-word line against a 200-word transcript stays under 5ms', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i % 37}`);
    const transcript = words.join(' ');
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) liveRead(words, transcript);
    expect((performance.now() - t0) / 10).toBeLessThan(5);
  });
});
