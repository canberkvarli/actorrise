'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { theatreFontVars, typewriterFontVar } from '@/lib/fonts/theatre';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { plainError } from '@/lib/rehearsal/prepare';
import { RehearseScreen } from './RehearseScreen';

/**
 * /scenes/<id>/rehearse — fetch the scene, hand off. `?guided=1` is the first
 * run, where the server picks the part.
 *
 * No skeleton and no spinner: the page is paper until the script is there.
 * `.theatre-rehearsal` carries the palette (app/globals.css); the font vars
 * are bound here so the three faces resolve on this element.
 */
export default function RehearsePage() {
  const { id } = useParams<{ id: string }>();
  const guided = useSearchParams().get('guided') === '1';
  const [payload, setPayload] = useState<ScenePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<ScenePayload>(`/api/rehearsal/scenes/${id}`)
      .then(r => { if (alive) setPayload(r.data); })
      .catch(() => { if (alive) setError(plainError('other')); });
    return () => { alive = false; };
  }, [id]);

  return (
    <div className={`theatre-tokens theatre-rehearsal overflow-x-clip ${theatreFontVars} ${typewriterFontVar}`}>
      {error && <p className="r-chrome mx-auto max-w-prose px-6 py-16">{error}</p>}
      {payload && <RehearseScreen payload={payload} guided={guided} />}
    </div>
  );
}
