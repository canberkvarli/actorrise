'use client';

/**
 * Wires the pure engine to the browser: one AudioPlayer, the LineLoader, the
 * live transcription session and the journal transport. Publishes one engine
 * snapshot per animation frame. It is the only hook the screen reads.
 *
 * `prepare` once per mount, then `begin` from the Begin tap.
 * - prepare opens the run first, so the Plus gate on POST /runs rejects
 *   prepare before anything is paid for (the screen catches it). Then the live
 *   session opens and partner audio loads, the first needed line ahead of the
 *   rest. A guided run (`opts.guided`) opens with POST /runs/guided and uses
 *   the character and voices THAT returns; the arguments are ignored and
 *   `payload` must be the guided scene's (GET /api/rehearsal/guided names it).
 *   Picking a run up (`opts.resumeRunId`, from `payload.resume`) goes through
 *   POST /runs/{id}/resume, which is not metered: the run was paid for when
 *   it was opened. The part, the voices and the line to start on are the
 *   run's, not the arguments'.
 * - Deltas reach engine.delta synchronously from the data channel
 *   (`onTranscript`), so nothing renders or awaits between the actor's last
 *   word and player.play.
 * - The journal port only appends; the flush runs on a microtask. On
 *   pagehide / hidden the pending events go out on a keepalive fetch carrying
 *   the bearer token: the API authenticates by token, and sendBeacon cannot
 *   set a header.
 * - The live session failing to open, or dropping, sets `readiness.error`
 *   and abandons a started run. Nothing retries; there is no fallback.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, API_URL, getAuthToken, getCachedAuthToken } from '@/lib/api';
import { useLiveCapture } from '@/hooks/useLiveCapture';
import { useLiveTranscription } from '@/hooks/useLiveTranscription';
import type { GuidedRun, ResumedRun, ScenePayload } from '@/lib/rehearsal/contract';
import { Engine, type Snapshot } from '@/lib/rehearsal/engine';
import { Journal, type JournalTransport } from '@/lib/rehearsal/journal';
import { buildScript } from '@/lib/rehearsal/script';
import { type AudioSlot, canBegin, firstNeededLine, limit, liveFailureKind, makeFlusher, neededFailure, plainError, planPartnerAudio, runFailure, type Readiness } from '@/lib/rehearsal/prepare';
import { AudioPlayer } from '@/lib/rehearsal/browser/audio-player';
import { LineLoader, type LineSource } from '@/lib/rehearsal/browser/line-loader';

export type { Readiness };

export interface Rehearsal {
  snapshot: Snapshot | null;
  readiness: Readiness;
  /** `line1 && stt && !error`. */
  canBegin: boolean;
  /** Once per mount, after the actor has chosen a part and voices. Rejects if the run cannot be opened (the Plus gate). */
  prepare: (character: string, voices: Record<string, string>, opts?: { guided?: boolean; resumeLine?: number; resumeRunId?: number }) => Promise<void>;
  /** Call from the Begin tap itself: the audio context is unlocked synchronously inside it. */
  begin: () => void;
  /**
   * Starting with no tap of its own (`?go=1`): unlock the context and say
   * whether it is running now. True on desktop, or when the preview's tap still
   * counts; false on iOS, where only a tap inside the page starts audio.
   */
  tryUnlock: () => boolean;
  /** The Plus gate (or the meter) refused the run; its message is `readiness.error`. */
  gated: boolean;
  pause: () => void; resume: () => void; skip: () => void; back: () => void; jumpTo: (line: number) => void;
  leave: () => void;
}

type Opened = { run_id: number; scene_id: number; character: string; voices: Record<string, string> };

/** Normal sends go through `api`; the unload path is a keepalive fetch, which outlives the page and carries the token. */
function transportFor(runId: number, token: { current: string | undefined }): JournalTransport {
  const path = `/api/rehearsal/runs/${runId}/events`;
  return {
    send: async events => {
      token.current = (await getAuthToken()) ?? token.current; // kept for the unload path, which cannot await
      await api.post(path, { events });
    },
    beacon: events => {
      const t = getCachedAuthToken() ?? token.current;
      if (!t) return false;
      try {
        void fetch(`${API_URL}${path}`, {
          method: 'POST', keepalive: true, body: JSON.stringify({ events }),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        }).catch(() => {});
        return true;
      } catch { return false; }
    },
  };
}

export function useRehearsal(payload: ScenePayload): Rehearsal {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [base, setBase] = useState<Omit<Readiness, 'stt'>>({ line1: false, mic: false, error: null, upgradeUrl: null });
  const [lineError, setLineError] = useState<string | null>(null); // a failed partner line the run still needs
  const [gated, setGated] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const loaderRef = useRef<LineLoader | null>(null);
  const journalRef = useRef<Journal | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const resumeLineRef = useRef<number | null>(null);
  const preparedRef = useRef(false);
  const failedRef = useRef(new Map<number, string>()); // partner line → why it failed to load
  // handover_ms is read off the audio clock, which does not advance inside one
  // JS task, so on a last-word handover it is 0 by construction and never
  // measures our work. compute_ms is that work: from the words (or the quiet)
  // arriving to the engine returning. The port keeps the actor_line_read
  // payload the engine emits during the call; the flush is a microtask away,
  // so the field lands before the batch is sent.
  const readRef = useRef<Record<string, unknown> | null>(null);
  const timed = (fn: () => void) => {
    const t0 = performance.now();
    readRef.current = null;
    fn();
    const read = readRef.current as Record<string, unknown> | null; // fn() may have set it; TS cannot see through the call
    if (read) { read.compute_ms = Math.round((performance.now() - t0) * 100) / 100; readRef.current = null; }
  };

  const fail = useCallback((error: string) => setBase(b => (b.error ? b : { ...b, error })), []);

  // useLiveCapture owns the one microphone stream; the words come from our own session below.
  const { prewarmStream, streamRef } = useLiveCapture();
  const getStream = useCallback(async () => {
    await prewarmStream();
    if (streamRef.current) setBase(b => ({ ...b, mic: true }));
    return streamRef.current;
  }, [prewarmStream, streamRef]);
  const { open, close, prime, beginTurn, endTurn, status } = useLiveTranscription({
    getStream,
    keywords: payload.characters,
    onTranscript: t => { if (t) timed(() => engineRef.current?.delta(t)); },
    onQuiet: () => timed(() => engineRef.current?.quiet()),
  });

  const publish = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setSnapshot(engineRef.current?.snapshot() ?? null);
    });
  }, []);

  const prepare = useCallback<Rehearsal['prepare']>(async (character, voices, opts) => {
    if (preparedRef.current) return;
    preparedRef.current = true;
    let run: Opened;
    let resumeLine: number | null = opts?.resumeLine ?? null;
    // The live session takes about a second to come up (a token, the mic, a
    // WebRTC handshake with OpenAI). It does not depend on the run, so it
    // opens alongside the request for one instead of after it.
    void open();
    try {
      if (opts?.resumeRunId !== undefined) {
        const picked = (await api.post<ResumedRun>(`/api/rehearsal/runs/${opts.resumeRunId}/resume`)).data;
        run = picked;
        resumeLine = picked.line_index;
      } else {
        run = opts?.guided
          ? (await api.post<GuidedRun>('/api/rehearsal/runs/guided')).data
          : { scene_id: payload.scene.id, character, ...(await api.post<{ run_id: number; voices: Record<string, string> }>(
              '/api/rehearsal/runs', { scene_id: payload.scene.id, character, voices })).data };
      }
    } catch (e) {
      preparedRef.current = false;
      // The Plus gate or the meter is an answer, not a breakage: its message goes on the Curtain with the plans link.
      close(); // no run, no session to pay for
      const why = runFailure(e);
      if (why.kind === 'gate') { setGated(true); setBase(b => ({ ...b, error: why.message, upgradeUrl: why.upgradeUrl })); return; }
      throw e;
    }
    if (run.scene_id !== payload.scene.id) {
      close();
      fail(plainError('other')); // not the guided scene
      // The run the server opened has no page: close it, and let a later prepare open another.
      void api.post(`/api/rehearsal/runs/${run.run_id}/events`, { events: [
        { seq: 0, type: 'abandoned', line_index: null, at_ms: 0, payload: { reason: 'scene_mismatch' } }] }).catch(() => {});
      preparedRef.current = false;
      return;
    }

    const player = (playerRef.current ??= new AudioPlayer());
    const loader = (loaderRef.current ??= new LineLoader(player));
    const journal = (journalRef.current = new Journal(transportFor(run.run_id, tokenRef)));
    const flush = makeFlusher(() => journal.flush(), queueMicrotask);
    const script = buildScript(payload.lines, run.character);
    const engine = new Engine(script, {
      clock: { now: () => player.now(), outputLatency: () => player.outputLatency() },
      player: { duration: l => player.duration(l), play: (l, at) => player.play(l, at), stopAll: () => player.stopAll() },
      mic: { prime, open: () => beginTurn(), close: endTurn },
      journal: { emit: (type, line, at, p) => {
        const payload = p ?? {};
        if (type === 'actor_line_read') readRef.current = payload; // timed() stamps compute_ms on it
        journal.emit(type, line, at, payload); flush();
      } },
      schedule: (at, fn) => player.schedule(at, fn),
    });
    resumeLineRef.current = resumeLine;
    const first = firstNeededLine(script, resumeLine);
    const start = first ?? resumeLine ?? 0;
    // Where the run is (or starts from, before Begin). The loader follows it,
    // so a jump or back onto a line never loaded loads it; a failed line is an
    // error only while the run has not passed it.
    const cursor = () => { const s = engine.snapshot(); return s.state === 'ready' ? start : s.lineIndex; };
    const follow = () => {
      const at = cursor();
      loader.ahead(at);
      setLineError(neededFailure(failedRef.current, at) === null ? null : plainError('line'));
    };
    let last = -1;
    engine.subscribe(() => { publish(); const at = cursor(); if (at !== last) { last = at; follow(); } });
    engineRef.current = engine;
    if (process.env.NODE_ENV !== 'production') (window as Window & { __rehearsal?: Engine }).__rehearsal = engine;
    publish();

    // A partner line first: Begin waits on its audio, not on the transcriber (prepare canBegin).
    setBase(b => ({ ...b, line1: b.line1 || first === null, partnerFirst: first !== null }));
    const failed = (l: number, why: string) => { failedRef.current.set(l, why); follow(); };
    loader.onReady = l => {
      engine.audioReady(l);
      if (failedRef.current.delete(l)) follow();
      if (l === first) setBase(b => ({ ...b, line1: true }));
    };
    loader.onFailed = failed;
    player.onInterrupted = () => engine.pause();

    const slow = limit(4); // per-line POST /audio, at most 4 in flight
    const set = (s: AudioSlot) => (s.source ? Promise.resolve(s.source)
      : slow(() => api.post<LineSource>('/api/rehearsal/audio', { scene_id: payload.scene.id, line_index: s.lineIndex, voice: s.voice })).then(r => r.data))
      .then(src => { loader.set(s.lineIndex, src); loader.ahead(cursor()); },
        e => failed(s.lineIndex, e instanceof Error ? e.message : String(e)));
    const slots = planPartnerAudio(payload, script, run.voices);
    const head = slots.find(s => s.lineIndex === first);
    if (head) await set(head);
    await Promise.all(slots.filter(s => s !== head).map(set));
  }, [payload, open, close, prime, beginTurn, endTurn, publish, fail]);

  const begin = useCallback(() => {
    const engine = engineRef.current, player = playerRef.current;
    if (!engine || !player) return;
    player.unlock(); // first and synchronous: iOS starts a context only inside the tap
    engine.begin(resumeLineRef.current ?? undefined);
  }, []);

  const tryUnlock = useCallback(() => playerRef.current?.unlock().state === 'running', []);

  // The live session failed to open or dropped: the run stops there.
  useEffect(() => {
    if (status !== 'error') return;
    engineRef.current?.abandon('stt_failed');
    loaderRef.current?.stop(); // nothing will play: stop polling for partner audio
  }, [status]);

  // Hidden: pause and send what is pending. Visible again: the context resumes, the scene does not.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { engineRef.current?.pause(); journalRef.current?.beacon(); }
      else if (engineRef.current && playerRef.current) playerRef.current.context().resume().catch(() => {});
    };
    const onPageHide = () => journalRef.current?.beacon();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide); };
  }, []);

  useEffect(() => () => {
    engineRef.current?.abandon('unmounted');
    journalRef.current?.beacon();
    if (process.env.NODE_ENV !== 'production') delete (window as Window & { __rehearsal?: Engine }).__rehearsal;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    loaderRef.current?.stop();
    playerRef.current?.close();
  }, []);

  // Every control that can start a partner line unlocks first, synchronously,
  // like begin: iOS suspends the context when the tab hides or the mic moves,
  // and only a call inside the tap itself brings it back.
  const controls = useMemo(() => {
    const unlocked = (fn: (engine: Engine) => void) => {
      playerRef.current?.unlock();
      if (engineRef.current) fn(engineRef.current);
    };
    return {
      pause: () => engineRef.current?.pause(),
      resume: () => unlocked(e => e.resume()),
      skip: () => unlocked(e => e.skip()),
      back: () => unlocked(e => e.back()),
      jumpTo: (l: number) => unlocked(e => e.jumpTo(l)),
      leave: () => { engineRef.current?.abandon('left'); journalRef.current?.beacon(); },
    };
  }, []);

  const readiness: Readiness = {
    ...base,
    stt: status === 'ready',
    error: base.error ?? lineError ?? (status === 'error' ? plainError(liveFailureKind(base.mic)) : null),
  };
  return { snapshot, readiness, canBegin: canBegin(readiness), prepare, begin, tryUnlock, gated, ...controls };
}
