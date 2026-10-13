'use client';

import { memo, useMemo } from 'react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import { displayRuns } from '@/lib/rehearsal/display-words';

interface Props {
  line: RehearsalLine; mine: boolean;
  /** For the actor's lines: indices of words heard. Undefined for partner lines. */
  heard?: Set<number>;
}

/**
 * One line of the sides: the cue, the direction, the words. On the actor's
 * lines every word is a span whose weight carries whether it was heard; one
 * span per matcher token, so index `i` is the word actually said. Nothing
 * else on a line changes while the scene runs.
 *
 * A line is never a button. A tap on it is a tap on the stage, which pauses
 * or resumes; jumping to a line by tapping it was landing on the line under
 * the second tap of every pause and resume.
 */
function LineView({ line, mine, heard }: Props) {
  const words = useMemo(() => displayRuns(line.text), [line.text]);

  const body = (
    <>
      <span className="r-cue block">{line.character}</span>
      {line.direction && <span className="r-direction block">{line.direction}</span>}
      <span className="block">
        {words.map((w, i) => (
          <span key={i} data-word={i} className={mine ? 'r-word' : undefined}
            data-heard={mine ? String(heard?.has(i) ?? false) : undefined}>
            {w.word}{w.gap ? ' ' : ''}
          </span>
        ))}
      </span>
    </>
  );

  return (
    <li data-line={line.index} className={mine ? 'r-line--mine' : 'r-line--theirs'}>
      <div className="py-3">{body}</div>
    </li>
  );
}

function sameWords(a?: Set<number>, b?: Set<number>): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const i of a) if (!b.has(i)) return false;
  return true;
}

/** The engine publishes a snapshot a frame; only the line whose heard words changed re-renders. */
export const Line = memo(LineView, (p, n) =>
  p.line === n.line && p.mine === n.mine && sameWords(p.heard, n.heard));
