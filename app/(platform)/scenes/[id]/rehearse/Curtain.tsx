'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { sameCharacter, type ScenePayload } from '@/lib/rehearsal/contract';
import { autoCommits, initialVoices, savedPart } from '@/lib/rehearsal/prefs';
import { getCharacterVoices, getMyRoles } from '@/lib/scenePrefs';

interface Props {
  payload: ScenePayload; guided: boolean; chosen: string | null; canBegin: boolean; error: string | null;
  /** With a gate message: where the plans are. */
  upgradeUrl?: string | null;
  /** With `resume`: pick that run up (it is not metered) instead of opening a new one. */
  onChoose: (character: string, voices: Record<string, string>, resume?: { runId: number; lineIndex: number }) => void;
  onBegin: () => void;
}

/**
 * Before the run: the title, the parts as plain tappable lines with the voice
 * under each, Begin. Tapping a part is the commitment (it opens the run), so
 * the voices are set first. With a run to pick up, the part tap is followed by
 * where to start. A guided run shows the title and Begin, nothing else.
 * The part and voices the preview chose (lib/scenePrefs) are where it opens: a
 * saved part commits by itself on mount, exactly as if tapped, so the "You"
 * under it is true. With a run to pick up it is only preselected, no "You",
 * until the actor says where to start (lib/rehearsal/prefs decides).
 */
export function Curtain({ payload, guided, chosen, canBegin, error, upgradeUrl, onChoose, onBegin }: Props) {
  const [voices, setVoices] = useState<Record<string, string>>(
    () => initialVoices(payload, getCharacterVoices(payload.scene.id)));
  const [saved] = useState(() => guided ? null : savedPart(payload.characters, getMyRoles(payload.scene.id)));
  const [picked, setPicked] = useState<string | null>(null); // a tapped part, waiting for where to start
  const resume = guided ? null : payload.resume;
  const mine = chosen || picked;
  const locked = Boolean(chosen);
  const starting = picked ?? saved; // the part the pick-up choice is for
  const committed = useRef(false);

  const commit = (character: string, pickUp?: { runId: number; lineIndex: number }) => {
    const partners = payload.characters.filter(c => !sameCharacter(c, character) && voices[c]);
    onChoose(character, Object.fromEntries(partners.map(c => [c, voices[c]])), pickUp);
  };
  const tapPart = (c: string) => { if (!locked) { if (resume) setPicked(c); else commit(c); } };
  useEffect(() => { // once, on mount; the ref keeps a re-render from committing twice
    if (committed.current || !saved || !autoCommits(saved, { resume: Boolean(resume), guided })) return;
    committed.current = true;
    commit(saved);
  });

  return (
    <section className="r-chrome mx-auto flex min-h-dvh w-full max-w-md flex-col justify-start px-6 pb-12 pt-[18vh]">
      {payload.scene.play_title && <p className="r-soft text-sm">{payload.scene.play_title}</p>}
      <h1 className="r-title mt-1 text-4xl leading-tight [overflow-wrap:anywhere]">{payload.scene.title}</h1>

      {!guided && (
        <ul className="mt-10 space-y-4">
          {payload.characters.map(c => {
            const isMine = mine !== null && sameCharacter(c, mine);
            const preselected = mine === null && saved !== null && sameCharacter(c, saved);
            return (
              <li key={c} className={mine && !isMine ? 'r-soft' : undefined}>
                <button type="button" disabled={locked} onClick={() => tapPart(c)}
                  className="flex min-h-11 w-full items-center text-left text-xl" aria-pressed={isMine || preselected}>
                  {c}
                </button>
                {isMine ? <p className="r-soft text-sm">You</p> : !preselected && payload.voices.length > 0 && (
                  <label className="r-soft flex min-h-11 items-center gap-1 text-sm">
                    read by
                    <select value={voices[c] ?? ''} disabled={locked} aria-label={`Voice for ${c}`}
                      onChange={e => setVoices(v => ({ ...v, [c]: e.target.value }))}
                      className="min-h-11 bg-transparent underline underline-offset-4">
                      {payload.voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resume && starting && !locked && (
        <div className="mt-8 flex flex-col items-start">
          <button type="button" className="min-h-11 text-lg" onClick={() => commit(starting, { runId: resume.run_id, lineIndex: resume.line_index })}>
            Pick up at line {resume.line_index + 1}
          </button>
          <button type="button" className="min-h-11 text-lg" onClick={() => commit(starting)}>From the top</button>
        </div>
      )}

      {error && <p className="mt-8 text-sm">{error}</p>}
      {error && upgradeUrl && (
        <Link href={upgradeUrl} className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4">See plans</Link>
      )}

      <button type="button" className="r-begin mt-12 min-h-11 self-start text-2xl" data-ready={canBegin}
        disabled={!canBegin} onClick={onBegin}>Begin</button>
    </section>
  );
}
