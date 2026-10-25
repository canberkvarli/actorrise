/**
 * How a run starts when the actor cast it on the scene preview (`?go=1`):
 * straight onto the Stage, no Curtain. Pure, so RehearseScreen only acts.
 */
import { sameCharacter } from './contract';
import { savedPart } from './prefs';

/**
 * The part a run opens on with no Curtain, or null when the Curtain shows: no
 * saved part in this scene, or a guided run (the server picks the part). A part
 * cast once is the part, however the actor got here: the preview's `?go=1`, a
 * bookmark, the back button. The Curtain asking "who are you, which voice,
 * Begin" again was the screen Canberk wanted gone (2026-10-26); it is left for
 * a scene never cast on this device, and for the Plus gate (goStep).
 * A run waiting to be picked up resumes at its line (Canberk, 2026-10-23);
 * starting over is a jump from the run's own top bar.
 */
export function skipsCurtain(
  characters: string[], roles: string[], opts: { go: boolean; resume: boolean; guided: boolean },
): string | null {
  if (opts.guided) return null;
  return savedPart(characters, roles);
}

/** What `prepare` is sent: every other part's voice, never the actor's own. */
export function partnerVoices(characters: string[], actor: string, voices: Record<string, string>): Record<string, string> {
  return Object.fromEntries(characters.filter(c => !sameCharacter(c, actor) && voices[c]).map(c => [c, voices[c]]));
}

/**
 * Where a curtainless run stands. The Plus gate sends it back to the Curtain,
 * which carries the gate's message and the plans link. Otherwise it starts once
 * it can begin and has not, and waits until then.
 */
export function goStep(s: { gated: boolean; canBegin: boolean; started: boolean }): 'curtain' | 'start' | 'wait' {
  if (s.gated) return 'curtain';
  return s.canBegin && !s.started ? 'start' : 'wait';
}

/**
 * Starting with no tap of its own: a running audio context (desktop, or a
 * gesture carried over the client-side navigation from the preview) begins
 * now; a suspended one (iOS) waits for a tap on the stage, which is the
 * gesture that unlocks it.
 */
export function startsBy(running: boolean): 'now' | 'tap' {
  return running ? 'now' : 'tap';
}
