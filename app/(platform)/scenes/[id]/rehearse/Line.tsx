'use client';

import { memo, useMemo, type CSSProperties } from 'react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import { displayRuns } from '@/lib/rehearsal/display-words';

/** Where the line sits against the run: already said, being said now, still to come. */
export type When = 'past' | 'live' | 'next';

interface Props {
  line: RehearsalLine; mine: boolean; when: When;
  /** For the actor's lines: indices of words heard. Undefined for partner lines. */
  heard?: Set<number>;
  /** The cast colour for the cue, as the scene preview deals it (lib/castColors). */
  cueStyle?: CSSProperties;
}

/**
 * One line of the sides, drawn as the scene preview draws it (`.t-prev__*`):
 * the cue in bold small caps, a "you" chip on the actor's own, the direction,
 * the words. On the actor's lines every word is a span whose weight carries
 * whether it was heard; one span per matcher token, so index `i` is the word
 * actually said. `data-when` marks the live line (the full rule) and the
 * lines already passed (they sit back).
 *
 * A line is never a button. A tap on it is a tap on the stage, which pauses
 * or resumes; jumping to a line by tapping it was landing on the line under
 * the second tap of every pause and resume.
 */
function LineView({ line, mine, when, heard, cueStyle }: Props) {
  const words = useMemo(() => displayRuns(line.text), [line.text]);
  return (
    <li data-line={line.index} data-mine={mine} data-when={when} className="t-prev__line r-line">
      <p className="t-prev__who" style={cueStyle}>
        <span className="t-prev__name">{line.character}</span>
        {mine && <span className="t-prev__yours">you</span>}
      </p>
      {line.direction && <p className="t-prev__dir">({line.direction})</p>}
      <p className="t-prev__text r-text">
        {words.map((w, i) => (
          <span key={i} data-word={i} className={mine ? 'r-word' : undefined}
            data-heard={mine ? String(heard?.has(i) ?? false) : undefined}>
            {w.word}{w.gap ? ' ' : ''}
          </span>
        ))}
      </p>
    </li>
  );
}

function sameWords(a?: Set<number>, b?: Set<number>): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const i of a) if (!b.has(i)) return false;
  return true;
}

/** The engine publishes a snapshot a frame; only a line whose place or heard words changed re-renders. */
export const Line = memo(LineView, (p, n) =>
  p.line === n.line && p.mine === n.mine && p.when === n.when && p.cueStyle === n.cueStyle && sameWords(p.heard, n.heard));
