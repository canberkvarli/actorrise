'use client';

import type { CSSProperties } from 'react';
import { ArrowLeft, Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react';
import type { RehearsalLine } from '@/lib/rehearsal/contract';
import type { Snapshot } from '@/lib/rehearsal/engine';

/**
 * The bar across the top: leave, where in the scene, and the run sheet. One
 * notch per line, the actor's notches taller, filled up to the live one. It
 * is a reading, not a control; a line is jumped to on the script itself.
 */
export function TopBar({ title, lines, actor, current, started, onLeave }: {
  title: string; lines: RehearsalLine[]; actor: (l: RehearsalLine) => boolean;
  current: number; started: boolean; onLeave: () => void;
}) {
  return (
    <header className="r-top">
      <div className="r-top__row">
        <button type="button" className="r-icon" onClick={onLeave} aria-label="Leave">
          <X size={20} strokeWidth={1.75} />
        </button>
        <p className="r-top__title">{title}</p>
        <p className="r-top__count" aria-label={`Line ${current + 1} of ${lines.length}`}>
          {started ? current + 1 : 0}<span>/{lines.length}</span>
        </p>
      </div>
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
  /** The run starts by itself and its first line is not ready yet. */
  getting?: boolean;
}

/**
 * The three controls, under the thumb: back, pause/play, skip. Above them one
 * word of state, so the actor never wonders whose line it is: their own (with
 * the mic breathing), the partner's name, or Paused, which also offers the
 * top of the scene.
 */
export function Dock({ snapshot, partner, onToggle, onSkip, onBack, onRestart, getting = false }: DockProps) {
  const state = snapshot?.state ?? 'ready';
  const paused = state === 'paused';
  const running = state === 'actor' || state === 'partner';
  return (
    <div className="r-dock" data-state={state}>
      <div className="r-dock__status" aria-live="polite">
        {state === 'ready' && getting && <><span className="r-spin" aria-hidden />Getting ready</>}
        {state === 'actor' && <><span className="r-mic" aria-hidden />Your line</>}
        {state === 'partner' && partner && <span className="r-dock__who" style={partner.style}>{partner.name}</span>}
        {paused && (
          <>Paused<span className="r-dock__sep" aria-hidden>·</span>
            <button type="button" className="r-dock__link" onClick={onRestart}>
              <RotateCcw size={13} strokeWidth={2} aria-hidden />Start over
            </button>
          </>
        )}
      </div>
      <div className="r-dock__row">
        <button type="button" className="r-ctl" onClick={onBack} disabled={!running && !paused}>
          <ArrowLeft size={22} strokeWidth={1.75} aria-hidden /><span>Back</span>
        </button>
        <button type="button" className="r-play" onClick={onToggle} disabled={!running && !paused}
          aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play size={26} fill="currentColor" strokeWidth={0} /> : <Pause size={26} fill="currentColor" strokeWidth={0} />}
        </button>
        <button type="button" className="r-ctl" onClick={onSkip} disabled={!running}>
          <SkipForward size={22} strokeWidth={1.75} aria-hidden /><span>Skip</span>
        </button>
      </div>
    </div>
  );
}
