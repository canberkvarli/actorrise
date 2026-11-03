'use client';

import { useT } from '@/lib/i18n';

/**
 * The actor's line, when the mic did not hear it (Engine `unheard`): the line
 * big, "say it again" (the mic reopens on the same line, the partner's cue is
 * not played again) and "skip line" (the scene goes on). With no mic at all
 * (`deaf`) it is the line and "next".
 *
 * Before this, an unheard line left the actor looking at the script with the
 * mic breathing; the way out they found was back, which replayed the cue.
 * 69 of 160 started runs of "Late" stopped on line one in October 2026.
 */
export function Unheard({ text, deaf, onAgain, onSkip }: { text: string; deaf: boolean; onAgain: () => void; onSkip: () => void }) {
  const t = useT();
  return (
    <div className="r-unheard" role="region" aria-live="polite" aria-label={t('appScenesRehearse.unheardHint')}>
      <p className="r-chrome r-soft m-0 text-sm">{deaf ? t('appScenesRehearse.unheardDeaf') : t('appScenesRehearse.unheardHint')}</p>
      <p className="r-unheard__line">{text}</p>
      <div className="r-unheard__row">
        {!deaf && (
          <button type="button" className="r-unheard__again" onClick={onAgain}>{t('appScenesRehearse.unheardSayAgain')}</button>
        )}
        <button type="button" className="r-play r-play--wide" onClick={onSkip}>
          {deaf ? t('appScenesRehearse.unheardNext') : t('appScenesRehearse.unheardSkip')}
        </button>
      </div>
    </div>
  );
}
