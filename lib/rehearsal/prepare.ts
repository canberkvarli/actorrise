/**
 * The decisions `useRehearsal` makes before and around a run, kept out of the
 * hook so they can be tested without a browser.
 */
import { type ScenePayload, sameCharacter } from './contract';
import type { Script } from './script';

/** What the Curtain waits on. Begin needs `line1 && stt && !error`; `mic` is shown, not required. */
export interface Readiness {
  /** The first partner line the run will play is decoded, or the actor speaks first. */
  line1: boolean;
  /** The live transcription session is open. */
  stt: boolean;
  /** A microphone stream was obtained. */
  mic: boolean;
  error: string | null;
}

export const canBegin = (r: Readiness) => r.line1 && r.stt && !r.error;

/**
 * The partner line that must be decoded before Begin: the first line of the
 * turn the run starts on (turn 0, or the turn holding `fromLine` on a resume,
 * which the engine plays from its beat's first line). Null when that turn is
 * the actor's, or there is nothing to play.
 */
export function firstNeededLine(script: Script, fromLine: number | null = null): number | null {
  const t = fromLine === null ? 0 : script.turnOfLine[fromLine];
  const turn = t === undefined ? undefined : script.turns[t];
  return turn?.kind === 'partner' ? turn.lineIndices[0] : null;
}

export interface AudioSlot {
  lineIndex: number;
  character: string;
  voice: string;
  /** The payload's slot when it is usable as is; null = ask POST /api/rehearsal/audio. */
  source: { key: string; url: string | null } | null;
}

const lookup = (m: Record<string, string> | undefined, character: string) =>
  Object.entries(m ?? {}).find(([c]) => sameCharacter(c, character))?.[1];

/**
 * One slot per partner line, in order. The payload carries audio only for the
 * part the server guessed, in that part's default voices, so its slot is used
 * when it covers every partner line of the part picked (that is the part) and
 * the line's character still has its default voice. Anything else is asked for.
 */
export function planPartnerAudio(payload: ScenePayload, script: Script, voices: Record<string, string>): AudioSlot[] {
  const defaults = Object.entries(payload.defaults).find(([c]) => sameCharacter(c, script.actor))?.[1];
  const partner = script.lines.filter(l => !sameCharacter(l.character, script.actor));
  const covered = partner.length > 0 && partner.every(l => payload.audio[String(l.index)]);
  return partner.map(l => {
    const fallback = lookup(defaults, l.character);
    const voice = lookup(voices, l.character) ?? fallback ?? payload.voices[0]?.id ?? '';
    const slot = payload.audio[String(l.index)];
    return { lineIndex: l.index, character: l.character, voice, source: covered && slot && voice === fallback ? slot : null };
  });
}

/**
 * The engine's journal port must not do I/O, so it asks for a flush and this
 * runs it later (`defer`). Requests in one tick coalesce into one flush; a
 * request made while a send is in flight runs one more flush after it, so the
 * last events of a run never sit in the queue waiting for a next emit. A
 * failed send is not retried here: the next request (or the beacon) carries it.
 */
export function makeFlusher(flush: () => Promise<void>, defer: (fn: () => void) => void): () => void {
  let queued = false, busy = false, again = false;
  const run = async () => {
    queued = false;
    if (busy) { again = true; return; }
    busy = true;
    try {
      do { again = false; await flush().catch(() => {}); } while (again);
    } finally { busy = false; }
  };
  return () => { if (!queued) { queued = true; defer(() => { void run(); }); } };
}
