'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sameCharacter, type ScenePayload } from '@/lib/rehearsal/contract';

interface Props {
  payload: ScenePayload; guided: boolean; chosen: string | null; canBegin: boolean; error: string | null;
  /** With a gate message: where the plans are. */
  upgradeUrl?: string | null;
  onChoose: (character: string, voices: Record<string, string>, resumeLine?: number) => void;
  onBegin: () => void;
}

/** A character's voice when someone else is reading opposite them: the server's default, else the first voice. */
function defaultVoice(payload: ScenePayload, character: string): string {
  for (const [actor, v] of Object.entries(payload.defaults)) {
    if (!sameCharacter(actor, character) && v[character]) return v[character];
  }
  return payload.voices[0]?.id ?? '';
}

/**
 * Before the run: the title, the parts as plain tappable lines with the voice
 * under each, Begin. Tapping a part is the commitment (it opens the run), so
 * the voices are set first. With a run to pick up, the part tap is followed by
 * where to start. A guided run shows the title and Begin, nothing else.
 */
export function Curtain({ payload, guided, chosen, canBegin, error, upgradeUrl, onChoose, onBegin }: Props) {
  const [voices, setVoices] = useState<Record<string, string>>(
    () => Object.fromEntries(payload.characters.map(c => [c, defaultVoice(payload, c)])));
  const [picked, setPicked] = useState<string | null>(null); // a part, waiting for where to start
  const resume = guided ? null : payload.resume;
  const mine = chosen || picked;
  const locked = Boolean(chosen);

  const commit = (character: string, resumeLine?: number) => {
    const partners = payload.characters.filter(c => !sameCharacter(c, character) && voices[c]);
    onChoose(character, Object.fromEntries(partners.map(c => [c, voices[c]])), resumeLine);
  };
  const tapPart = (c: string) => {
    if (locked) return;
    if (resume) setPicked(c); else commit(c);
  };

  return (
    <section className="r-chrome mx-auto flex min-h-dvh w-full max-w-md flex-col justify-start px-6 pb-12 pt-[18vh]">
      {payload.scene.play_title && <p className="r-soft text-sm">{payload.scene.play_title}</p>}
      <h1 className="r-title mt-1 text-4xl leading-tight [overflow-wrap:anywhere]">{payload.scene.title}</h1>

      {!guided && (
        <ul className="mt-10 space-y-4">
          {payload.characters.map(c => {
            const isMine = mine !== null && sameCharacter(c, mine);
            return (
              <li key={c} className={mine && !isMine ? 'r-soft' : undefined}>
                <button type="button" disabled={locked} onClick={() => tapPart(c)}
                  className="flex min-h-11 w-full items-center text-left text-xl" aria-pressed={isMine}>
                  {c}
                </button>
                {isMine ? (
                  <p className="r-soft text-sm">You</p>
                ) : payload.voices.length > 0 && (
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

      {resume && picked && !locked && (
        <div className="mt-8 flex flex-col items-start">
          <button type="button" className="min-h-11 text-lg" onClick={() => commit(picked, resume.line_index)}>
            Pick up at line {resume.line_index + 1}
          </button>
          <button type="button" className="min-h-11 text-lg" onClick={() => commit(picked)}>From the top</button>
        </div>
      )}

      {error && <p className="mt-8 text-sm">{error}</p>}
      {error && upgradeUrl && (
        <Link href={upgradeUrl} className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4">
          See plans
        </Link>
      )}

      <button type="button" className="r-begin mt-12 min-h-11 self-start text-2xl" data-ready={canBegin}
        disabled={!canBegin} onClick={onBegin}>
        Begin
      </button>
    </section>
  );
}
