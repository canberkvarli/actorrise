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
import type { GuidedRun, ScenePayload } from '@/lib/rehearsal/contract';
import { Engine, type Snapshot } from '@/lib/rehearsal/engine';
import { Journal, type JournalTransport } from '@/lib/rehearsal/journal';
import { buildScript } from '@/lib/rehearsal/script';
import { type AudioSlot, canBegin, firstNeededLine, makeFlusher, planPartnerAudio, type Readiness } from '@/lib/rehearsal/prepare';
import { AudioPlayer } from '@/lib/rehearsal/browser/audio-player';
import { LineLoader, type LineSource } from '@/lib/rehearsal/browser/line-loader';

export type { Readiness };

export interface Rehearsal {
  snapshot: Snapshot | null;
  readiness: Readiness;
  /** `line1 && stt && !error`. */
  canBegin: boolean;
  /** Once per mount, after the actor has chosen a part and voices. Rejects if the run cannot be opened (the Plus gate). */
  prepare: (character: string, voices: Record<string, string>, opts?: { guided?: boolean; resumeLine?: number }) => Promise<void>;
  /** Call from the Begin tap itself: the audio context is unlocked synchronously inside it. */
  begin: () => void;
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
  const [base, setBase] = useState<Omit<Readiness, 'stt'>>({ line1: false, mic: false, error: null });
  const engineRef = useRef<Engine | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const loaderRef = useRef<LineLoader | null>(null);
  const journalRef = useRef<Journal | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const frameRef = useRef<number | null>(null);
  const resumeLineRef = useRef<number | null>(null);
  const preparedRef = useRef(false);

  const fail = useCallback((error: string) => setBase(b => (b.error ? b : { ...b, error })), []);

  // useLiveCapture owns the one microphone stream; the words come from our own session below.
  const { prewarmStream, streamRef } = useLiveCapture();
  const getStream = useCallback(async () => {
    await prewarmStream();
    if (streamRef.current) setBase(b => ({ ...b, mic: true }));
    return streamRef.current;
  }, [prewarmStream, streamRef]);
  const { open, prime, beginTurn, endTurn, status, error: liveError } = useLiveTranscription({
    getStream,
    keywords: payload.characters,
    onTranscript: t => { if (t) engineRef.current?.delta(t); },
    onQuiet: () => engineRef.current?.quiet(),
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
    try {
      run = opts?.guided
        ? (await api.post<GuidedRun>('/api/rehearsal/runs/guided')).data
        : { scene_id: payload.scene.id, character, ...(await api.post<{ run_id: number; voices: Record<string, string> }>(
            '/api/rehearsal/runs', { scene_id: payload.scene.id, character, voices })).data };
    } catch (e) { preparedRef.current = false; throw e; }
    if (run.scene_id !== payload.scene.id) { fail('This page is not the guided scene.'); return; }

    void open();
    const player = (playerRef.current ??= new AudioPlayer());
    const loader = (loaderRef.current ??= new LineLoader(player));
    const journal = (journalRef.current = new Journal(transportFor(run.run_id, tokenRef)));
    const flush = makeFlusher(() => journal.flush(), queueMicrotask);
    const script = buildScript(payload.lines, run.character);
    const engine = new Engine(script, {
      clock: { now: () => player.now(), outputLatency: () => player.outputLatency() },
      player: { duration: l => player.duration(l), play: (l, at) => player.play(l, at), stopAll: () => player.stopAll() },
      mic: { prime, open: () => beginTurn(), close: endTurn },
      journal: { emit: (type, line, at, p) => { journal.emit(type, line, at, p); flush(); } },
      schedule: (at, fn) => player.schedule(at, fn),
    });
    engine.subscribe(publish);
    engineRef.current = engine;
    if (process.env.NODE_ENV !== 'production') (window as Window & { __rehearsal?: Engine }).__rehearsal = engine;
    publish();

    const resumeLine = opts?.resumeLine ?? null;
    resumeLineRef.current = resumeLine;
    const first = firstNeededLine(script, resumeLine);
    if (first === null) setBase(b => ({ ...b, line1: true }));
    loader.onReady = l => { engine.audioReady(l); if (l === first) setBase(b => ({ ...b, line1: true })); };
    loader.onFailed = (_l, why) => fail(`A partner line could not load (${why}).`);
    player.onInterrupted = () => engine.pause();

    const from = (first ?? resumeLine ?? 0) - 1;
    const set = (s: AudioSlot) => (s.source ? Promise.resolve(s.source)
      : api.post<LineSource>('/api/rehearsal/audio', { scene_id: payload.scene.id, line_index: s.lineIndex, voice: s.voice }).then(r => r.data))
      .then(src => { loader.set(s.lineIndex, src); loader.ahead(from); });
    const slots = planPartnerAudio(payload, script, run.voices);
    const head = slots.find(s => s.lineIndex === first);
    try {
      if (head) await set(head);
      await Promise.all(slots.filter(s => s !== head).map(set));
    } catch (e) { fail(`A partner line could not load (${e instanceof Error ? e.message : String(e)}).`); }
  }, [payload, open, prime, beginTurn, endTurn, publish, fail]);

  const begin = useCallback(() => {
    const engine = engineRef.current, player = playerRef.current;
    if (!engine || !player) return;
    player.unlock(); // first and synchronous: iOS starts a context only inside the tap
    engine.begin();
    if (resumeLineRef.current !== null) engine.jumpTo(resumeLineRef.current);
  }, []);

  // The live session failed to open or dropped: the run stops there.
  useEffect(() => { if (status === 'error') engineRef.current?.abandon(); }, [status]);

  // Keep the loader ahead of the scene on every handover.
  const line = snapshot?.lineIndex;
  useEffect(() => { if (line !== undefined) loaderRef.current?.ahead(line); }, [line]);

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
    engineRef.current?.abandon();
    journalRef.current?.beacon();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    loaderRef.current?.stop();
    playerRef.current?.close();
  }, []);

  const controls = useMemo(() => ({
    pause: () => engineRef.current?.pause(), resume: () => engineRef.current?.resume(),
    skip: () => engineRef.current?.skip(), back: () => engineRef.current?.back(),
    jumpTo: (l: number) => engineRef.current?.jumpTo(l),
    leave: () => { engineRef.current?.abandon(); journalRef.current?.beacon(); },
  }), []);

  const readiness: Readiness = {
    ...base,
    stt: status === 'ready',
    error: base.error ?? (status === 'error' ? (liveError ?? 'The live microphone could not start.') : null),
  };
  return { snapshot, readiness, canBegin: canBegin(readiness), prepare, begin, ...controls };
}
