'use client';

import { useEffect, useState } from 'react';
import type { ScenePayload } from '@/lib/rehearsal/contract';

interface Props { scene: ScenePayload['scene']; onAgain: () => void; onLeave: () => void }

/** The last line holds this long before anything is said about it. */
const HOLD_MS = 1000;

/** "Act 2, Scene 1": the data has "2" or "Act 2" for an act, "1" for a scene. */
export function whereInPlay(scene: ScenePayload['scene']): string {
  const act = scene.act?.trim();
  const sc = scene.scene_number?.trim();
  return [
    act ? (/^\d+$|^[IVXLC]+$/i.test(act) ? `Act ${act}` : act) : null,
    sc ? (/^\d+$|^[IVXLC]+$/i.test(sc) ? `Scene ${sc}` : sc) : null,
  ].filter(Boolean).join(', ');
}

/** The moment: the last line stays where it is, then one line and two choices. */
export function Ending({ scene, onAgain, onLeave }: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), HOLD_MS);
    return () => clearTimeout(t);
  }, []);
  if (!shown) return null;

  const where = whereInPlay(scene);
  return (
    <div role="status" className="r-chrome fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-6"
      style={{ background: 'var(--t-paper)' }}>
      <p className="text-lg">{where ? `${where}. ` : ''}Full run.</p>
      <div className="mt-3 flex gap-8 text-xl">
        <button type="button" className="min-h-12" onClick={onAgain}>Again</button>
        <button type="button" className="r-soft min-h-12" onClick={onLeave}>Leave</button>
      </div>
    </div>
  );
}
