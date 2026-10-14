'use client';

import { useEffect, useMemo, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { animate, type AnimationPlaybackControls } from 'framer-motion';
import { castColorVars, castPalette } from '@/lib/castColors';
import { sameCharacter, type RehearsalLine } from '@/lib/rehearsal/contract';
import type { Snapshot } from '@/lib/rehearsal/engine';
import { Line, type When } from './Line';

interface Props {
  lines: RehearsalLine[]; actor: string; snapshot: Snapshot | null; paused: boolean;
  /** Start the run at this line. Absent while it cannot jump (not begun, or over). */
  onJump?: (line: number) => void;
}

/** Fraction of the viewport height where the live word is held: the middle of the pool of light. */
const EYE_LINE = 0.4;
/** The one motion on the page. Close to critical, so a wrapped line settles without bouncing. */
const SPRING = { type: 'spring', stiffness: 170, damping: 26 } as const;
/** After the actor scrolls by hand, the script stays where they put it this long. */
const HANDS_OFF_MS = 3500;
const NO_WORDS = new Set<number>();

/**
 * The script, full bleed, in the light. The live line sits in the pool at the
 * eye line and the text moves under it: on a partner line that is the line's
 * cue, on the actor's line the next word to say, so a long line scrolls up a
 * row as the actor reads. Above and below, the page falls off into the house.
 *
 * Every other line is a target: a tap starts the run there (`onJump`). The
 * live line is not, so a tap on what you are reading never restarts it. A
 * scroll is not a tap (the browser sends no click after one), and a swipe's
 * click is swallowed by bindGestures before it gets here.
 *
 * Scrolling by hand to find a line is left alone for a few seconds, then the
 * script follows the run again on its next move.
 */
export function Stage({ lines, actor, snapshot, paused, onJump }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const motion = useRef<AnimationPlaybackControls | null>(null);
  const placed = useRef(false);
  const handsOn = useRef(0);
  const current = snapshot?.lineIndex ?? 0;
  const matched = snapshot?.read.matched;
  const next = matched && matched.size ? Math.max(...matched) + 1 : 0;
  const cues = useMemo(() => {
    const palette = castPalette(lines.map(l => l.character));
    return new Map<string, CSSProperties>([...new Set(lines.map(l => l.character))].map(n => [n, castColorVars(n, palette)]));
  }, [lines]);

  useEffect(() => {
    const el = scroller.current;
    const line = el?.querySelector<HTMLElement>(`[data-line="${current}"]`);
    if (!el || !line) return;
    if (placed.current && performance.now() - handsOn.current < HANDS_OFF_MS) return;
    const words = line.querySelectorAll<HTMLElement>('[data-word]');
    const mark = words.length ? words[Math.min(next, words.length - 1)] : line;
    const top = mark.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const target = Math.max(0, top - el.clientHeight * EYE_LINE);
    motion.current?.stop();
    if (!placed.current) { el.scrollTop = target; placed.current = true; return; } // arriving: no travel
    if (Math.abs(el.scrollTop - target) < 1) return;
    motion.current = animate(el.scrollTop, target, { ...SPRING, onUpdate: v => { el.scrollTop = v; } });
  }, [current, next]);

  useEffect(() => () => motion.current?.stop(), []);

  // A hand on the script: stop the follow where it is.
  const grab = () => { handsOn.current = performance.now(); motion.current?.stop(); };

  const target = (e: { target: EventTarget }) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
    const i = li ? Number(li.dataset.line) : NaN;
    return onJump && Number.isFinite(i) && i !== current ? i : null;
  };
  const onClick = (e: MouseEvent) => {
    const i = target(e);
    if (i === null) return;
    handsOn.current = 0; // a jump is a request to follow the run again, now
    onJump?.(i);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const i = target(e);
    if (i !== null) { e.preventDefault(); handsOn.current = 0; onJump?.(i); }
  };

  return (
    <div ref={scroller} onWheel={grab} onTouchMove={grab}
      className={`r-stage h-dvh overflow-y-auto overscroll-contain ${paused ? 'r-stage--paused' : ''}`}>
      <div aria-hidden className="h-[40dvh]" />
      <ol className="r-script mx-auto max-w-[38rem] px-3 sm:px-6" data-jumps={onJump ? 'true' : 'false'}
        onClick={onClick} onKeyDown={onKey}>
        {lines.map(line => {
          const mine = sameCharacter(line.character, actor);
          const live = snapshot?.lineIndex === line.index && snapshot.state !== 'ready';
          const when: When = live ? 'live' : snapshot && snapshot.state !== 'ready' && line.index < current ? 'past' : 'next';
          const heard = !mine ? undefined
            : live && snapshot ? snapshot.read.matched
            : snapshot?.heard.get(line.index) ?? NO_WORDS;
          const speaking = live ? (snapshot?.state === 'actor' ? 'listening' : snapshot?.state === 'partner' ? 'sounding' : 'held') : undefined;
          return <Line key={line.index} line={line} mine={mine} when={when} heard={heard} speaking={speaking}
            jumpable={Boolean(onJump) && !live} cueStyle={cues.get(line.character)} />;
        })}
      </ol>
      <div aria-hidden className="h-[60dvh]" />
    </div>
  );
}
