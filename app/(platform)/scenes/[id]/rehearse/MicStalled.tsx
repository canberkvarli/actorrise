'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { micBrowser, micFix, micPermission, type MicPermission } from '@/lib/rehearsal/mic-fix';

/**
 * The guided run stopped on a dead mic (Engine `stalled`): two actor lines in
 * a row with nothing heard. One plain sentence, the fix for this browser,
 * "try again" (the mic opens again on the same line) and, quietly, reading on
 * without the mic. Before it, half the runs of "A fight" that reached the end
 * were eight skips in a row with the mic hearing nothing.
 */
export function MicStalled({ onRetry, onWithoutMic }: { onRetry: () => Promise<boolean>; onWithoutMic: () => void }) {
  const t = useT();
  const [permission, setPermission] = useState<MicPermission>('unknown');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { void micPermission().then(setPermission); }, []);
  const fix = micFix(typeof navigator === 'undefined' ? 'other' : micBrowser(navigator.userAgent), permission);

  const retry = async () => {
    setBusy(true);
    const ok = await onRetry().catch(() => false);
    setBusy(false);
    if (!ok) { setFailed(true); void micPermission().then(setPermission); }
  };

  return (
    <div className="r-unheard" role="alertdialog" aria-live="assertive" aria-labelledby="r-stalled-title">
      <p id="r-stalled-title" className="r-chrome m-0 text-center text-lg font-semibold">{t('appScenesRehearse.micStalledTitle')}</p>
      <p className="r-chrome r-soft m-0 max-w-[34ch] text-center text-sm">
        {failed ? `${t('appScenesRehearse.micStalledStill')} ` : ''}{t(`appScenesRehearse.${fix}`)}
      </p>
      <div className="r-unheard__row">
        <button type="button" className="r-play r-play--wide" onClick={retry} disabled={busy}>
          {t('appScenesRehearse.micStalledRetry')}
        </button>
      </div>
      <button type="button" className="r-chrome r-soft inline-flex min-h-11 items-center text-sm underline underline-offset-4" onClick={onWithoutMic}>
        {t('appScenesRehearse.micStalledWithoutMic')}
      </button>
    </div>
  );
}
