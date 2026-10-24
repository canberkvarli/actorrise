'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRehearsal } from '@/hooks/useRehearsal';
import { castColorVars, castPalette } from '@/lib/castColors';
import { sameCharacter } from '@/lib/rehearsal/contract';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { bindGestures } from '@/lib/rehearsal/browser/gestures';
import { goStep, partnerVoices, skipsCurtain, startsBy } from '@/lib/rehearsal/entry';
import { initialVoices } from '@/lib/rehearsal/prefs';
import { plainError } from '@/lib/rehearsal/prepare';
import { getBook, getCharacterVoices, getMyRoles, setBook } from '@/lib/scenePrefs';
import { nextPrompt, type Book } from '@/lib/rehearsal/book';
import { lineWords } from '@/lib/live-read';
import { Curtain } from './Curtain';
import { Stage } from './Stage';
import { Dock, TopBar } from './Dock';
import { Ending } from './Ending';
import { FirstRunHint } from './FirstRunHint';

/** Whatever the server said, the actor reads one plain sentence. */
const failure = () => plainError('other');

/**
 * Which panel is up, and the gestures. Two phases: the Curtain (choose a part,
 * wait for Begin to turn to ink) and the run (the script, the top bar and the
 * dock, with the ending laid over them).
 *
 * `prepare` opens a metered run, so it is called exactly once per mount: when
 * the actor taps a part (or, with a run to pick up, chooses where to start).
 *
 * Straight onto the Stage, with no Curtain: `go` (`?go=1`, from the scene
 * preview, where the actor cast the scene; the saved part and voices) and a
 * guided run (the first scene; the server picks the part). The run prepares on
 * mount and begins by itself once it can, when the audio context runs; on iOS
 * it waits for one tap anywhere, which is the gesture that unlocks it. No saved
 * part and it is the Curtain; so is the Plus gate
 * (lib/rehearsal/entry decides).
 */
export function RehearseScreen({ payload, guided, go }: { payload: ScenePayload; guided: boolean; go: boolean }) {
  const router = useRouter();
  const { snapshot, readiness, canBegin, prepare, begin, tryUnlock, gated, pause, resume, skip, back, jumpTo, leave } = useRehearsal(payload);
  const [goPart] = useState(() => skipsCurtain(payload.characters, getMyRoles(payload.scene.id),
    { go, resume: Boolean(payload.resume), guided }));
  // Straight onto the Stage: cast on the preview, or the guided first scene.
  const straight = goPart !== null || guided;
  const [phase, setPhase] = useState<'curtain' | 'run'>(straight ? 'run' : 'curtain');
  const goPrepared = useRef(false);
  const goBegun = useRef(false);
  const [chosen, setChosen] = useState<string | null>(goPart);
  const [prepError, setPrepError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const guidedStarted = useRef(false);
  const state = snapshot?.state ?? 'ready';
  const error = readiness.error ?? prepError;
  // How much of their own lines the actor reads from, kept per scene, and the
  // words they called for this run, by line.
  const [book, setBookState] = useState<Book>(() => getBook(payload.scene.id));
  const [given, setGiven] = useState<Map<number, Set<number>>>(() => new Map());
  const onBook = useCallback((b: Book) => { setBookState(b); setBook(payload.scene.id, b); }, [payload.scene.id]);

  const choose = useCallback(async (character: string, voices: Record<string, string>, pickUp?: { runId: number; lineIndex: number }) => {
    setPrepError(null);
    setChosen(character);
    try {
      await prepare(character, voices, { resumeRunId: pickUp?.runId, resumeLine: pickUp?.lineIndex });
    } catch {
      // The Plus gate, or a run the server would not open. One line; the actor may tap again.
      setChosen(null);
      setPrepError(failure());
    }
  }, [prepare]);

  // Guided: the server picks the part and the voices, so the arguments are empty.
  useEffect(() => {
    if (!guided || guidedStarted.current) return;
    guidedStarted.current = true;
    prepare('', {}, { guided: true }).catch(() => setPrepError(failure()));
  }, [guided, prepare]);

  // Go: prepare once, on mount, as the Curtain would on a tapped part.
  useEffect(() => {
    if (!goPart || goPrepared.current) return;
    goPrepared.current = true;
    const voices = partnerVoices(payload.characters, goPart, initialVoices(payload, getCharacterVoices(payload.scene.id)));
    // A run to pick up carries on from where its journal stopped, unmetered.
    const pickUp = payload.resume ? { resumeRunId: payload.resume.run_id, resumeLine: payload.resume.line_index } : undefined;
    prepare(goPart, voices, pickUp).catch(() => { setChosen(null); setPrepError(failure()); });
  }, [goPart, prepare, payload]);

  // Go: begin by itself where audio may start. Where it may not (iOS), the
  // run stays ready and "Tap to begin" below takes the tap that unlocks it.
  useEffect(() => {
    if (!straight || goStep({ gated, canBegin, started: goBegun.current }) !== 'start') return;
    goBegun.current = true;
    if (startsBy(tryUnlock()) === 'now') begin();
  }, [straight, gated, canBegin, tryUnlock, begin]);
  // Ready and not begun. On desktop that lasts one frame, so the line fades in late enough never to show.
  const waitingTap = straight && canBegin && state === 'ready';

  const onBegin = () => { begin(); setPhase('run'); };

  useEffect(() => { pausedRef.current = state === 'paused'; }, [state]);

  const ended = state === 'ended';
  useEffect(() => {
    const el = rootRef.current;
    if (!el || phase !== 'run' || ended || state === 'ready') return;
    return bindGestures(el, { pause: () => (pausedRef.current ? resume() : pause()), skip, back });
  }, [phase, ended, state, pause, resume, skip, back]);

  const onLeave = () => { leave(); router.push('/practice'); };
  const onAgain = () => window.location.reload();
  const toggle = () => (pausedRef.current ? resume() : pause());

  const actor = snapshot?.actor ?? goPart ?? '';
  const liveLine = snapshot?.state === 'actor' ? snapshot.lineIndex : null;
  // A line taken again (back, a jump, a resume, which starts it from its first
  // word) starts with nothing given: the second try is a fresh test. Adjusted
  // as the live line changes, in render, the way React has state follow a value.
  const [takenLine, setTakenLine] = useState<number | null>(null);
  if (liveLine !== takenLine) {
    setTakenLine(liveLine);
    if (liveLine !== null && given.has(liveLine)) {
      const m = new Map(given); m.delete(liveLine); setGiven(m);
    }
  }
  const prompt = liveLine === null || !snapshot ? null : (() => {
    const n = lineWords(payload.lines[liveLine]?.text ?? '').length;
    const words = nextPrompt(book, n, snapshot.read.position, snapshot.read.matched, given.get(liveLine) ?? new Set());
    return words.length === 0 ? null
      : () => setGiven(g => new Map(g).set(liveLine, new Set([...(g.get(liveLine) ?? []), ...words])));
  })();
  // "Line" said out loud does what the button does. The engine counts the
  // calls on the turn; each new one gives the next words, in render.
  const calls = liveLine === null ? 0 : snapshot?.calls ?? 0;
  const [seenCalls, setSeenCalls] = useState(0);
  if (calls !== seenCalls) {
    setSeenCalls(calls);
    if (calls > seenCalls) prompt?.();
  }
  const running = state === 'actor' || state === 'partner' || state === 'paused';
  const current = snapshot?.lineIndex ?? 0;
  const cast = useMemo(() => castPalette(payload.characters), [payload.characters]);
  const speaking = state === 'partner' ? payload.lines[current] : undefined;
  const partner = speaking ? { name: speaking.character, style: castColorVars(speaking.character, cast) } : null;

  if (phase === 'curtain' || (straight && gated)) {
    return (
      <Curtain payload={payload} guided={guided} chosen={chosen} canBegin={canBegin}
        error={error} upgradeUrl={readiness.error ? readiness.upgradeUrl : null} onChoose={choose} onBegin={onBegin} />
    );
  }

  return (
    <div ref={rootRef} className="relative h-dvh overflow-hidden">
      <Stage lines={payload.lines} actor={actor} snapshot={snapshot}
        paused={state === 'paused'} onJump={running ? jumpTo : undefined} warming={straight && !error}
        book={book} given={given} />
      <TopBar title={payload.scene.title} lines={payload.lines} actor={l => sameCharacter(l.character, actor)}
        current={current} started={state !== 'ready'} onLeave={onLeave} book={book} onBook={onBook} />
      {!ended && <Dock snapshot={snapshot} partner={partner} onToggle={toggle} onSkip={skip} onBack={back}
        onRestart={() => jumpTo(0)} onPrompt={prompt ?? undefined} />}
      {straight && !canBegin && !error && state === 'ready' && (
        <div role="status" className="r-getting">
          <span className="r-spin r-spin--big" aria-hidden />
          <span>Getting ready</span>
        </div>
      )}
      {waitingTap && !error && (
        <button type="button" className="fixed inset-0 z-40 block w-full cursor-default" onClick={begin}>
          <motion.span className="r-chrome r-soft absolute inset-x-0 top-[40dvh] text-center text-base"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>Tap to begin</motion.span>
        </button>
      )}
      {ended && !error && <Ending scene={payload.scene} guided={guided} onAgain={onAgain} onLeave={onLeave} />}
      {error && (
        <p className="r-chrome fixed inset-x-0 bottom-0 z-40 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 text-center"
          style={{ background: 'var(--t-paper)' }}>
          {error}{' '}
          <button type="button" className="r-soft inline-flex min-h-11 items-center underline underline-offset-4" onClick={onLeave}>Leave</button>
        </p>
      )}
      <FirstRunHint />
    </div>
  );
}
