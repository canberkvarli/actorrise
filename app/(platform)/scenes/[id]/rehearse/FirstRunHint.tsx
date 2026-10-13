'use client';

import { useEffect, useState } from 'react';

const KEY = 'actorrise.rehearsal.hint.v2';
const SHOWN_MS = 6000;

/** The one gesture hint: once per browser, six seconds, then gone. */
export function FirstRunHint() {
  // Only ever rendered in the browser (the run phase), so storage can be read at first render.
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem(KEY); } catch { return false; } // blocked: no hint rather than one every time
  });
  useEffect(() => {
    if (!show) return;
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    const t = setTimeout(() => setShow(false), SHOWN_MS);
    return () => clearTimeout(t);
  }, [show]);
  if (!show) return null;
  return (
    <p className="r-chrome r-soft pointer-events-none fixed inset-x-0 top-[calc(1rem+env(safe-area-inset-top,0px))] px-6 text-center text-sm">
      Tap a line to start there. Tap anywhere else to pause. Swipe left to skip your line, right to go back.
    </p>
  );
}
