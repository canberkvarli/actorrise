'use client';

import { Fragment, memo, useMemo, type CSSProperties } from 'react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import { displayRuns } from '@/lib/rehearsal/display-words';

/** Where the line sits against the run: already said, being said now, still to come. */
export type When = 'past' | 'live' | 'next';
/** On the live line, who has the floor: the partner sounding, the mic listening, neither (paused), or the run still getting ready. */
export type Speaking = 'sounding' | 'listening' | 'held' | 'warming';

interface Props {
  line: RehearsalLine; mine: boolean; when: When;
  /** For the actor's lines: indices of words heard. Undefined for partner lines. */
  heard?: Set<number>;
  speaking?: Speaking;
  /** On your live line: the index of the word you are on (the reading position). */
  at?: number;
  /** A tap here starts the run on this line (Stage handles the click). */
  jumpable: boolean;
  /** The cast colour for the cue, as the scene preview deals it (lib/castColors). */
  cueStyle?: CSSProperties;
}

/**
 * One line of the scene: the cue in small caps, the direction, the words in
 * the typewriter face. The margin to the left holds the cue light, lit only
 * on the live line. On the actor's lines every word is a span whose weight
 * carries whether it was heard; one span per matcher token, so index `i` is
 * the word actually said.
 *
 * On the live line, heard words fill in ink and the word the actor is on
 * (`at`) carries a quiet underline. Both only ever move forward, because the
 * reading position does. The space after each word sits outside its span so
 * the underline stops at the word, and the live line never changes weight:
 * bold widens a word, and a word widening mid-line re-wraps the paragraph,
 * which read as the words jumping.
 */
function LineView({ line, mine, when, heard, speaking, at, jumpable, cueStyle }: Props) {
  const words = useMemo(() => displayRuns(line.text), [line.text]);
  return (
    <li data-line={line.index} data-mine={mine} data-when={when} data-speaking={speaking}
      data-jumpable={jumpable} tabIndex={jumpable ? 0 : undefined}
      aria-label={jumpable ? `Start from ${line.character}: ${line.text.slice(0, 40)}` : undefined}
      aria-current={when === 'live' ? 'step' : undefined}
      className="r-line" style={cueStyle}>
      <span aria-hidden className="r-light" />
      <p className="r-who">
        <span className="r-name">{line.character}</span>
        {mine && <span className="r-you">you</span>}
      </p>
      {line.direction && <p className="r-dir">{line.direction}</p>}
      <p className="r-text">
        {words.map((w, i) => (
          <Fragment key={i}>
            <span data-word={i} className={mine ? 'r-word' : undefined}
              data-heard={mine ? String(heard?.has(i) ?? false) : undefined}
              data-at={mine && at === i ? 'true' : undefined}>
              {w.word}
            </span>
            {w.gap ? ' ' : null}
          </Fragment>
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

/** The engine publishes a snapshot a frame; only a line whose place, position or heard words changed re-renders. */
export const Line = memo(LineView, (p, n) =>
  p.line === n.line && p.mine === n.mine && p.when === n.when && p.speaking === n.speaking && p.at === n.at
  && p.jumpable === n.jumpable && p.cueStyle === n.cueStyle && sameWords(p.heard, n.heard));
