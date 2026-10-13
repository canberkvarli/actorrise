'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRehearsal } from '@/hooks/useRehearsal';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { bindGestures } from '@/lib/rehearsal/browser/gestures';
import { plainError } from '@/lib/rehearsal/prepare';
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
 */
export function RehearseScreen({ payload, guided }: { payload: ScenePayload; guided: boolean }) {
  const router = useRouter();
  const { snapshot, readiness, canBegin, prepare, begin, pause, resume, skip, back, jumpTo, leave } = useRehearsal(payload);
  const [phase, setPhase] = useState<'curtain' | 'run'>('curtain');
  const [chosen, setChosen] = useState<string | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const guidedStarted = useRef(false);
  const state = snapshot?.state ?? 'ready';
  const error = readiness.error ?? prepError;

  const choose = useCallback(async (character: string, voices: Record<string, string>, resumeLine?: number) => {
    setPrepError(null);
    setChosen(character);
    try {
      await prepare(character, voices, { resumeLine });
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

  const onBegin = () => { begin(); setPhase('run'); };

  useEffect(() => { pausedRef.current = state === 'paused'; }, [state]);

  const ended = state === 'ended';
  useEffect(() => {
    const el = rootRef.current;
    if (!el || phase !== 'run' || ended) return;
    return bindGestures(el, { pause: () => (pausedRef.current ? resume() : pause()), skip, back });
  }, [phase, ended, pause, resume, skip, back]);

  const onLeave = () => { leave(); router.push('/practice'); };
  const onAgain = () => window.location.reload();

  if (phase === 'curtain') {
    return (
      <Curtain payload={payload} guided={guided} chosen={chosen} canBegin={canBegin}
        error={error} onChoose={choose} onBegin={onBegin} />
    );
  }

  return (
    <div ref={rootRef} className="relative h-dvh overflow-hidden">
      <Stage lines={payload.lines} actor={snapshot?.actor ?? ''} snapshot={snapshot}
        paused={state === 'paused'} onTapLine={jumpTo} />
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
