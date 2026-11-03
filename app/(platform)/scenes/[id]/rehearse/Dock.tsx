'use client';

import type { CSSProperties } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import type { Snapshot } from '@/lib/rehearsal/engine';
import { BOOKS, type Book } from '@/lib/rehearsal/book';
import { useT, type MessageKey } from '@/lib/i18n';

/** The switch's labels, by id; lib/rehearsal/book keeps the English ones. */
const BOOK_LABEL: Record<Book, MessageKey> = {
  script: 'appScenesRehearse.bookScript',
  cues: 'appScenesRehearse.bookCues',
  off: 'appScenesRehearse.bookOff',
};

/**
 * The bar across the top: leave, where in the scene, and the run sheet. One
 * notch per line, the actor's notches taller, filled up to the live one. It
 * is a reading, not a control; a line is jumped to on the script itself.
 */
export function TopBar({ title, lines, actor, current, started, onLeave, book, onBook }: {
  title: string; lines: RehearsalLine[]; actor: (l: RehearsalLine) => boolean;
  current: number; started: boolean; onLeave: () => void;
  /** How much of the actor's lines shows; switchable at any point in the run. Absent: no switch. */
  book: Book; onBook?: (book: Book) => void;
}) {
  const t = useT();
  return (
    <header className="r-top">
      <div className="r-top__row">
        <button type="button" className="r-icon" onClick={onLeave} aria-label={t('appScenesRehearse.leave')}>
          <X size={20} strokeWidth={1.75} />
        </button>
        <p className="r-top__title">{title}</p>
        <p className="r-top__count" aria-label={t('appScenesRehearse.lineOf', { n: current + 1, total: lines.length })}>
          {started ? current + 1 : 0}<span>/{lines.length}</span>
        </p>
      </div>
      {onBook && <div className="r-book" role="radiogroup" aria-label={t('appScenesRehearse.yourLines')}>
        {BOOKS.map(b => (
          <button key={b.id} type="button" role="radio" aria-checked={book === b.id}
            className="r-book__opt" onClick={() => onBook(b.id)}>
            {t(BOOK_LABEL[b.id])}
          </button>
        ))}
      </div>}
      <ol className="r-sheet" aria-hidden>
        {lines.map(l => (
          <li key={l.index} data-mine={actor(l)}
            data-when={!started || l.index > current ? 'next' : l.index === current ? 'live' : 'past'} />
        ))}
      </ol>
    </header>
  );
}

interface DockProps {
  snapshot: Snapshot | null;
  /** The name on the partner line sounding, with its cast colour. */
  partner: { name: string; style?: CSSProperties } | null;
  onToggle: () => void; onSkip: () => void; onBack: () => void; onRestart: () => void;
  /** Off the script, on the actor's line: give them the next word. Absent when there is nothing to give. */
  onPrompt?: () => void;
  /** The word that calls for a line out loud, in the scene's language ("line", "replik"). */
  callWord?: string;
}

/**
 * The three controls, under the thumb: back, pause/play, skip. Above them one
 * word of state, so the actor never wonders whose line it is: their own (with
 * the mic breathing), the partner's name, or Paused, which also offers the
 * top of the scene. Off the script, their own line also offers "Line!", what
 * an actor calls in rehearsal when the next word will not come.
 */
export function Dock({ snapshot, partner, onToggle, onSkip, onBack, onRestart, onPrompt, callWord = 'line' }: DockProps) {
  const t = useT();
  const state = snapshot?.state ?? 'ready';
  const paused = state === 'paused';
  const running = state === 'actor' || state === 'partner';
  return (
    <div className="r-dock" data-state={state}>
      <div className="r-dock__status" aria-live="polite">
        {state === 'actor' && <><span className="r-mic" aria-hidden />{t('appScenesRehearse.yourLine')}</>}
        {state === 'actor' && onPrompt && (
          <>
            <span className="r-dock__sep" aria-hidden>·</span>
            <button type="button" className="r-dock__link" onClick={onPrompt} aria-label={t('appScenesRehearse.lineCallLabel')} title={t('appScenesRehearse.lineCallTitle', { word: callWord })}>
              {t('appScenesRehearse.lineCall')}
            </button>
          </>
        )}
        {state === 'partner' && partner && <span className="r-dock__who" style={partner.style}>{partner.name}</span>}
        {paused && (
          <>{t('appScenesRehearse.paused')}<span className="r-dock__sep" aria-hidden>·</span>
            <button type="button" className="r-dock__link" onClick={onRestart}>
              <RotateCcw size={13} strokeWidth={2} aria-hidden />{t('appScenesRehearse.startOver')}
            </button>
          </>
        )}
      </div>
      <div className="r-dock__row">
        <button type="button" className="r-ctl" onClick={onBack} disabled={!running && !paused}>
          <ArrowLeft size={22} strokeWidth={1.75} aria-hidden /><span>{t('appScenesRehearse.back')}</span>
        </button>
        <button type="button" className="r-play" onClick={onToggle} disabled={!running && !paused}
          aria-label={paused ? t('appScenesRehearse.resume') : t('appScenesRehearse.pause')}>
          {paused ? <Play size={26} fill="currentColor" strokeWidth={0} /> : <Pause size={26} fill="currentColor" strokeWidth={0} />}
        </button>
        <button type="button" className="r-ctl" onClick={onSkip} disabled={!running}>
          <SkipForward size={22} strokeWidth={1.75} aria-hidden /><span>{t('appScenesRehearse.skip')}</span>
        </button>
      </div>
    </div>
  );
}
