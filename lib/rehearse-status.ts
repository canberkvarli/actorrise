/**
 * What the rehearsal screen says it is doing.
 *
 * Two findings, from Canberk running the guided scene on a phone on 2026-10-03.
 *
 * **The status had no words.** It was one coloured dot, with the text moved to
 * `sr-only`, on the reasoning that "an actor only needs to know whose turn it
 * is, and the colour says that". The person who wrote that rule could not read
 * his own screen: he reported the dot as amber and saying "Listen" while the
 * scene was in fact still generating the partner's voice. Amber, green and blue
 * are not self-explanatory, and the one moment an actor looks at the status is
 * the moment they have lost the thread — which is exactly when a colour alone
 * is no help. So the word comes back, visible.
 *
 * **It must never claim to have heard particular words.** The live per-word
 * highlight was built from browser speech recognition interim results, which on
 * iOS Safari return the first word and then nothing. Saying "I won't" lit up
 * `I` and left `won't` dark, which reads as "it cannot hear me" when the
 * microphone is working perfectly. Beyond the accuracy problem, tracking words
 * on the page is the wrong thing to ask of an actor: it pulls the eyes down to
 * watch themselves being scored, when rehearsal is for getting off the page.
 *
 * So the screen states whose turn it is and whether a voice is being heard —
 * both of which come from the microphone level, which is reliable — and never
 * which words it thinks were said.
 */

export interface RehearseState {
  /** The partner's audio is being generated. */
  loadingVoice: boolean;
  /** The partner is speaking now. */
  partnerSpeaking: boolean;
  /** The take is over and the transcript is on its way back. */
  transcribing: boolean;
  /** The microphone is open for the actor's line. */
  listening: boolean;
  /** Anything else in flight. */
  processing: boolean;
  /** It is the actor's line, but the microphone is not open yet. */
  userTurn: boolean;
  /** The microphone is hearing a voice right now. From the level, not from
   *  recognition, so it is true whenever someone is actually talking. */
  voiceHeard?: boolean;
  /** The partner's name, for the one message that names them. */
  partnerName?: string | null;
}

export interface RehearseStatus {
  /** Shown on screen. Lowercase, two words at most, in the actor's language. */
  text: string;
  /** Tailwind background for the dot. */
  color: string;
  pulse: boolean;
}

export function rehearseStatus(s: RehearseState): RehearseStatus {
  if (s.loadingVoice) {
    return { text: "warming up", color: "bg-amber-400", pulse: true };
  }
  if (s.partnerSpeaking) {
    // Naming them is the difference between a machine reporting its state and a
    // scene partner having the line.
    return { text: `${s.partnerName || "partner"} speaking`, color: "bg-amber-400", pulse: true };
  }
  if (s.transcribing) {
    return { text: "one moment", color: "bg-blue-400", pulse: true };
  }
  if (s.listening) {
    // The only distinction the actor needs while their mouth is open: is sound
    // reaching it. Never which words.
    return s.voiceHeard
      ? { text: "hearing you", color: "bg-green-400", pulse: true }
      : { text: "your line", color: "bg-green-400", pulse: true };
  }
  if (s.processing) {
    return { text: "one moment", color: "bg-blue-400", pulse: true };
  }
  if (s.userTurn) {
    return { text: "your line", color: "bg-orange-400", pulse: false };
  }
  return { text: "ready", color: "bg-neutral-500", pulse: false };
}
