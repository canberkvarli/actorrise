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
 * So the screen states whose turn it is and whether a voice is being heard,
 * and never which words it thinks were said.
 *
 * **One colour.** This returned amber, blue, green, orange and grey across six
 * states, which is a legend the actor has to learn and then read while acting.
 * Canberk, 2026-10-08: "not many indicators please be very simple, colors even
 * might be confusing like green blue orange". The dot now says only whether
 * something is happening; the WORD says what. The script carries the actor's
 * own progress, which is the one thing worth looking at, and it carries it by
 * filling in as they speak rather than by changing hue.
 */

export interface RehearseState {
  /** The partner's audio is being generated. */
  loadingVoice: boolean;
  /** The partner is speaking now. */
  partnerSpeaking: boolean;
  /** The microphone is open for the actor's line. */
  listening: boolean;
  /** Anything else in flight. */
  processing: boolean;
  /** It is the actor's line, but the microphone is not open yet. */
  userTurn: boolean;
  /** Words are arriving from the live transcriber right now. */
  voiceHeard?: boolean;
  /** The partner's name, for the one message that names them. */
  partnerName?: string | null;
}

export interface RehearseStatus {
  /** Shown on screen. Lowercase, two words at most, in the actor's language. */
  text: string;
  /** The dot. One token for every state on purpose — see the note above. */
  color: string;
  pulse: boolean;
}

/** The only colour the status wears. It is ink, not a signal. */
const DOT = "bg-[var(--t-muted-dark)]";

export function rehearseStatus(s: RehearseState): RehearseStatus {
  if (s.loadingVoice) {
    return { text: "warming up", color: DOT, pulse: true };
  }
  if (s.partnerSpeaking) {
    // Naming them is the difference between a machine reporting its state and a
    // scene partner having the line.
    return { text: `${s.partnerName || "partner"} speaking`, color: DOT, pulse: true };
  }
  if (s.listening) {
    // The only distinction the actor needs while their mouth is open: is sound
    // reaching it. Never which words.
    return s.voiceHeard
      ? { text: "hearing you", color: DOT, pulse: true }
      : { text: "your line", color: DOT, pulse: true };
  }
  if (s.processing) {
    return { text: "one moment", color: DOT, pulse: true };
  }
  if (s.userTurn) {
    return { text: "your line", color: DOT, pulse: false };
  }
  return { text: "ready", color: DOT, pulse: false };
}
