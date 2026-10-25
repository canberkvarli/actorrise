'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MonologuePaywallModal } from '@/components/monologue-work/MonologuePaywallModal';
import { sameCharacter, type ScenePayload } from '@/lib/rehearsal/contract';
import { autoCommits, initialVoices, savedPart } from '@/lib/rehearsal/prefs';
import { getCharacterNotes, getCharacterVoices, getMyRoles, setCharacterNote, setCharacterVoices } from '@/lib/scenePrefs';

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
 *
 * Under each partner part: its voice, a ▶ that plays a few seconds of it (a
 * static file, so trying ten voices costs nothing), and a note for the part
 * ("meaner", "he's been drinking"). The note is Plus: everyone sees the
 * field, a free account sees it locked and a tap opens the plans. A changed
 * voice or note is kept (lib/scenePrefs) and re-voices that part's lines
 * through the ordinary cache when the run opens.
 */
export function Curtain({ payload, guided, chosen, canBegin, error, upgradeUrl, onChoose, onBegin }: Props) {
  const [voices, setVoices] = useState<Record<string, string>>(
    () => initialVoices(payload, getCharacterVoices(payload.scene.id)));
  const [notes, setNotes] = useState<Record<string, string>>(() => getCharacterNotes(payload.scene.id));
  const [asking, setAsking] = useState(false);
  const canDirect = Boolean(payload.can_direct);
  const chooseVoice = (c: string, id: string) => {
    setVoices(v => ({ ...v, [c]: id }));
    // Kept like the preview keeps it, so the next run of this scene opens on it.
    setCharacterVoices(payload.scene.id, { ...getCharacterVoices(payload.scene.id), [c]: id });
  };
  const writeNote = (c: string, note: string) => {
    setNotes(n => ({ ...n, [c]: note }));
    setCharacterNote(payload.scene.id, c, note);
  };
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
  useEffect(() => { // once, on mount; the ref keeps a re-render from committing twice. Already chosen (a `?go=1` run the gate stopped): nothing to commit.
    if (committed.current || chosen || !saved || !autoCommits(saved, { resume: Boolean(resume), guided })) return;
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
                  <>
                    <div className="flex items-center gap-1">
                      <label className="r-soft flex min-h-11 items-center gap-1 text-sm">
                        read by
                        <select value={voices[c] ?? ''} disabled={locked} aria-label={`Voice for ${c}`}
                          onChange={e => chooseVoice(c, e.target.value)}
                          className="min-h-11 bg-transparent underline underline-offset-4">
                          {payload.voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                        </select>
                      </label>
                      <VoiceSample src={payload.voices.find(v => v.id === voices[c])?.sample ?? null} name={c} />
                    </div>
                    {canDirect ? (
                      <input type="text" value={notes[c] ?? ''} disabled={locked} maxLength={payload.note_max ?? 120}
                        onChange={e => writeNote(c, e.target.value)} aria-label={`A note for ${c}`}
                        placeholder={`A note for ${c}, like "meaner"`}
                        className="r-soft min-h-11 w-full border-0 border-b border-current/30 bg-transparent text-sm outline-none placeholder:opacity-60" />
                    ) : (
                      <button type="button" disabled={locked} onClick={() => setAsking(true)}
                        className="r-soft flex min-h-11 items-center text-left text-sm" aria-disabled>
                        A note for {c}, like &quot;meaner&quot;
                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">Plus</span>
                      </button>
                    )}
                  </>
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

      <MonologuePaywallModal
        open={asking}
        onOpenChange={setAsking}
        feature="partner_direction"
        title="Directing your partner is a Plus thing."
        description="With Plus you can give each part a note, like meaner, slower or drunker, and the partner reads it that way. Free to start, card on file, cancel before it renews."
      />
    </section>
  );
}

/** ▶ a few seconds of a voice. One element at a time: a second tap, or another voice, stops the first. */
let playing: HTMLAudioElement | null = null;
function VoiceSample({ src, name }: { src: string | null; name: string }) {
  const [on, setOn] = useState(false);
  if (!src) return null;
  const toggle = () => {
    if (on && playing) { playing.pause(); playing = null; setOn(false); return; }
    playing?.pause();
    const a = new Audio(src);
    playing = a;
    setOn(true);
    a.onended = a.onpause = () => setOn(false);
    a.play().catch(() => setOn(false));
  };
  return (
    <button type="button" onClick={toggle} aria-label={on ? `Stop the voice for ${name}` : `Hear the voice for ${name}`}
      className="r-soft inline-flex min-h-11 min-w-11 items-center justify-center text-sm">
      {on ? '■' : '▶'}
    </button>
  );
}
