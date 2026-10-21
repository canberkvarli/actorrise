'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { theatreFontVars, typewriterFontVar } from '@/lib/fonts/theatre';
import type { ScenePayload } from '@/lib/rehearsal/contract';
import { plainError } from '@/lib/rehearsal/prepare';
import { RehearseScreen } from './RehearseScreen';

/**
 * /scenes/<id>/rehearse — fetch the scene, hand off. `?guided=1` is the first
 * run, where the server picks the part. `?go=1` comes from the scene preview,
 * where the actor already cast it: no Curtain when the saved part fits.
 *
 * No skeleton and no spinner: the page is paper until the script is there.
 * `.theatre-rehearsal` carries the palette (app/globals.css); the font vars
 * are bound here so the three faces resolve on this element.
 */
export default function RehearsePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const guided = search.get('guided') === '1';
  const go = search.get('go') === '1';
  const [payload, setPayload] = useState<ScenePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refreshUser } = useAuth();

  // The guided run sets has_seen_first_rehearsal on the server. Pull the user
  // again on the way out, so the next page does not invite them to the scene
  // they have just played from a cached copy of the account.
  useEffect(() => {
    if (!guided) return;
    return () => {
      void refreshUser().catch(() => undefined);
    };
  }, [guided, refreshUser]);

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
      {payload && <RehearseScreen payload={payload} guided={guided} go={go} />}
    </div>
  );
}
