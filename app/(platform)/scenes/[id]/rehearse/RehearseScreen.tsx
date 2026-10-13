'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useRehearsal } from '@/hooks/useRehearsal';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { bindGestures } from '@/lib/rehearsal/browser/gestures';
import { goStep, partnerVoices, skipsCurtain, startsBy } from '@/lib/rehearsal/entry';
import { initialVoices } from '@/lib/rehearsal/prefs';
import { plainError } from '@/lib/rehearsal/prepare';
import { getCharacterVoices, getMyRoles } from '@/lib/scenePrefs';
import { Curtain } from './Curtain';
import { Stage } from './Stage';
import { PauseSheet } from './PauseSheet';
import { Ending } from './Ending';
import { FirstRunHint } from './FirstRunHint';

/** Whatever the server said, the actor reads one plain sentence. */
const failure = () => plainError('other');

/**
 * Which panel is up, and the gestures. Two phases: the Curtain (choose a part,
 * wait for Begin to turn to ink) and the run (the sides, with the pause sheet
 * and the ending laid over them).
 *
 * `prepare` opens a metered run, so it is called exactly once per mount: when
 * the actor taps a part (or, with a run to pick up, chooses where to start).
 * A guided run prepares on mount and the server picks the part; the Begin tap
 * is still the actor's, because iOS starts audio only inside a gesture.
 *
 * `go` (`?go=1`, from the scene preview, where the actor cast the scene): no
 * Curtain. The run prepares on mount with the saved part and voices and the
 * Stage is up from the start. Once it can begin it begins by itself when the
 * audio context runs; on iOS it waits for one tap anywhere on the stage, which
 * is the gesture that unlocks it. No saved part, or a run to pick up, and it
 * is the Curtain as before; so is the Plus gate (lib/rehearsal/entry decides).
 */
export function RehearseScreen({ payload, guided, go }: { payload: ScenePayload; guided: boolean; go: boolean }) {
  const router = useRouter();
  const { snapshot, readiness, canBegin, prepare, begin, tryUnlock, gated, pause, resume, skip, back, jumpTo, leave } = useRehearsal(payload);
  const [goPart] = useState(() => skipsCurtain(payload.characters, getMyRoles(payload.scene.id),
    { go, resume: Boolean(payload.resume), guided }));
  const [phase, setPhase] = useState<'curtain' | 'run'>(goPart ? 'run' : 'curtain');
  const goPrepared = useRef(false);
  const goBegun = useRef(false);
  const [chosen, setChosen] = useState<string | null>(goPart);
  const [prepError, setPrepError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const guidedStarted = useRef(false);
  const state = snapshot?.state ?? 'ready';
  const error = readiness.error ?? prepError;

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
    prepare(goPart, voices).catch(() => { setChosen(null); setPrepError(failure()); });
  }, [goPart, prepare, payload]);

  // Go: begin by itself where audio may start. Where it may not (iOS), the
  // run stays ready and "Tap to begin" below takes the tap that unlocks it.
  useEffect(() => {
    if (!goPart || goStep({ gated, canBegin, started: goBegun.current }) !== 'start') return;
    goBegun.current = true;
    if (startsBy(tryUnlock()) === 'now') begin();
  }, [goPart, gated, canBegin, tryUnlock, begin]);
  // Ready and not begun. On desktop that lasts one frame, so the line fades in late enough never to show.
  const waitingTap = goPart !== null && canBegin && state === 'ready';

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

  if (phase === 'curtain' || (goPart && gated)) {
    return (
      <Curtain payload={payload} guided={guided} chosen={chosen} canBegin={canBegin}
        error={error} upgradeUrl={readiness.error ? readiness.upgradeUrl : null} onChoose={choose} onBegin={onBegin} />
    );
  }

  return (
    <div ref={rootRef} className="relative h-dvh overflow-hidden">
      <Stage lines={payload.lines} actor={snapshot?.actor ?? goPart ?? ''} snapshot={snapshot}
        paused={state === 'paused'} onTapLine={jumpTo} />
      {waitingTap && !error && (
        <button type="button" className="fixed inset-0 block w-full cursor-default" onClick={begin}>
          <motion.span className="r-chrome r-soft absolute inset-x-0 top-[42dvh] text-center text-base"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.3 }}>Tap to begin</motion.span>
        </button>
      )}
      {state === 'paused' && !error && <PauseSheet onResume={resume} onRestart={() => jumpTo(0)} onLeave={onLeave} />}
      {ended && !error && <Ending scene={payload.scene} onAgain={onAgain} onLeave={onLeave} />}
      {error && (
        <p className="r-chrome fixed inset-x-0 bottom-0 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 text-center"
          style={{ background: 'var(--t-paper)' }}>
          {error}{' '}
          <button type="button" className="r-soft inline-flex min-h-11 items-center underline underline-offset-4" onClick={onLeave}>Leave</button>
        </p>
      )}
      <FirstRunHint />
    </div>
  );
}
