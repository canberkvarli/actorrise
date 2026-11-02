'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';

const KEY = 'actorrise.rehearsal.hint.v4';
const SHOWN_MS = 6000;

/** The one gesture hint: once per browser, six seconds, then gone. */
export function FirstRunHint() {
  const t = useT();
  // Only ever rendered in the browser (the run phase), so storage can be read at first render.
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(KEY); } catch { return false; } // blocked: no hint rather than one every time
  });
  useEffect(() => {
    if (!show) return;
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    const timer = setTimeout(() => setShow(false), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [show]);
  if (!show) return null;
  return (
    <p className="r-chrome r-soft pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-20 px-6 text-center text-sm">
      {t('appScenesRehearse.hint')}
    </p>
  );
}
