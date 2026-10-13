'use client';

import { memo, useMemo, useRef } from 'react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import { displayRuns } from '@/lib/rehearsal/display-words';

interface Props {
  line: RehearsalLine; mine: boolean;
  /** For the actor's lines: indices of words heard. Undefined for partner lines. */
  heard?: Set<number>;
  /** Paused: the line is a button that jumps to it. Running: it lets taps through to the stage, which pauses. */
  tappable: boolean;
  onTap: (index: number) => void;
}

/** While paused, a drag (a scroll, a swipe) that ends on a line is not a tap on it. */
const TAP_SLOP_PX = 10;

/**
 * One line of the sides: the cue, the direction, the words. On the actor's
 * lines every word is a span whose weight carries whether it was heard; one
 * span per matcher token, so index `i` is the word actually said. Nothing
 * else on a line changes while the scene runs.
 */
function LineView({ line, mine, heard, tappable, onTap }: Props) {
  const words = useMemo(() => displayRuns(line.text), [line.text]);
  const down = useRef<{ x: number; y: number } | null>(null);

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
    <li data-line={line.index}
      className={`${tappable ? 'pointer-events-auto' : 'pointer-events-none'} ${mine ? 'r-line--mine' : 'r-line--theirs'}`}>
      {tappable ? (
        <button type="button" className="block w-full py-3 text-left"
          onPointerDown={e => { down.current = { x: e.clientX, y: e.clientY }; }}
          onClick={e => {
            const d = down.current;
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP_PX) return;
            onTap(line.index);
          }}>
          {body}
        </button>
      ) : (
        <div className="py-3">{body}</div>
      )}
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
  p.line === n.line && p.mine === n.mine && p.tappable === n.tappable && p.onTap === n.onTap && sameWords(p.heard, n.heard));
