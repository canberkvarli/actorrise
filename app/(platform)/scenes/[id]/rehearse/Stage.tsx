'use client';

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { animate, type AnimationPlaybackControls } from 'framer-motion';
import { castColorVars, castPalette } from '@/lib/castColors';
import { sameCharacter, type RehearsalLine } from '@/lib/rehearsal/contract';
import type { Snapshot } from '@/lib/rehearsal/engine';
import { Line, type When } from './Line';

interface Props {
  lines: RehearsalLine[]; actor: string; snapshot: Snapshot | null; paused: boolean;
}

/** Fraction of the viewport height where the live word is held. */
const EYE_LINE = 0.42;
/** The one motion on the page. Close to critical, so a wrapped line settles without bouncing. */
const SPRING = { type: 'spring', stiffness: 170, damping: 26 } as const;
const NO_WORDS = new Set<number>();

/**
 * The sides, as the scene preview prints them: the same paper on the same
 * house (`.theatre-monologue` flips both with the theme), the same cue, chip
 * and rule. What the run adds is where it is: the live line (the actor's, or
 * the partner's sounding) carries the full rule, lines passed sit back.
 *
 * The live word sits at the eye line and the text moves under it:
 * on a partner line that is the line's cue, on the actor's line it is the next
 * word to say, so a line that wraps scrolls up a row as the actor reads.
 *
 * Taps. The whole scroller is the pause target, running or paused: a tap
 * pauses, the next tap resumes (RehearseScreen toggles). Nothing on it is a
 * button, so no tap can land on a line and jump. The pause sheet sits outside
 * the scroller, so its own buttons never toggle.
 */
export function Stage({ lines, actor, snapshot, paused }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const motion = useRef<AnimationPlaybackControls | null>(null);
  const placed = useRef(false);
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

  return (
    <div ref={scroller} className={`theatre-monologue r-stage h-dvh overflow-y-auto overscroll-contain ${paused ? 'r-dim' : ''}`}
      data-pause-target="">
      <div className="relative">
        <div aria-hidden className="pointer-events-none relative h-[42dvh]" />
        <ol className="t-prev__paper r-sides pointer-events-none relative mx-4 sm:mx-auto sm:max-w-prose">
          {lines.map(line => {
            const mine = sameCharacter(line.character, actor);
            const live = snapshot?.lineIndex === line.index;
            const when: When = live ? 'live' : snapshot && line.index < current ? 'past' : 'next';
            const heard = !mine ? undefined
              : live && snapshot ? snapshot.read.matched
              : snapshot?.heard.get(line.index) ?? NO_WORDS;
            return <Line key={line.index} line={line} mine={mine} when={when} heard={heard} cueStyle={cues.get(line.character)} />;
          })}
        </ol>
        <div aria-hidden className="pointer-events-none relative h-[58dvh]" />
      </div>
    </div>
  );
}
