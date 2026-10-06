"use client";

import { useEffect, useRef, useState } from "react";

import { COACH_TEXT, coachState, type CoachState } from "@/lib/guided-coach";

interface Props {
  partnerSpeaking: boolean;
  micOpen: boolean;
  linesHeard: number;
  /** The level gate's answer for the current take; read on every tick. */
  voicedThisTake: () => boolean;
  tapMode: boolean;
  /** Reported on every change so the page can make the line tappable on a nudge. */
  onState?: (state: CoachState) => void;
  /** The status dot's colour classes; it sits in the line instead of a pill. */
  dotClass?: string;
  /**
   * A voice is reaching the microphone RIGHT NOW.
   *
   * Off the level, not off speech recognition, so it stays true for an actor
   * whose words never transcribe — which on iOS Safari is most of them. The
   * dot is the only live feedback in the guided scene, and a dot that just
   * sits there cannot distinguish "I am listening" from "I have frozen".
   */
  hearingYou?: boolean;
}

/**
 * Feeds lib/guided-coach what the rehearse page knows, on a half-second tick
 * while the mic is open (the nudge is a function of time, and the page has no
 * event for "six seconds passed").
 */
export function GuidedCoachLine({ partnerSpeaking, micOpen, linesHeard, voicedThisTake, tapMode, onState, dotClass, hearingYou }: Props) {
  const [state, setState] = useState<CoachState>("listen");
  const stateRef = useRef<CoachState>("listen");
  const micOpenedAtRef = useRef<number | null>(null);
  const onStateRef = useRef(onState);
  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  useEffect(() => {
    micOpenedAtRef.current = micOpen ? Date.now() : null;
  }, [micOpen]);

  useEffect(() => {
    const step = () => {
      const openedAt = micOpenedAtRef.current;
      const next = coachState(stateRef.current, {
        partnerSpeaking,
        micOpen,
        linesHeard,
        msSinceMicOpened: openedAt == null ? 0 : Date.now() - openedAt,
        voicedThisTake: voicedThisTake(),
        tapMode,
      });
      if (next !== stateRef.current) {
        stateRef.current = next;
        setState(next);
        onStateRef.current?.(next);
      }
    };
    step();
    if (!micOpen) return;
    const id = setInterval(step, 500);
    return () => clearInterval(id);
  }, [partnerSpeaking, micOpen, linesHeard, tapMode, voicedThisTake]);

  const text = COACH_TEXT[state];
  return (
    <p className="t-coach" aria-live="polite" data-state={state}>
      {dotClass && <span aria-hidden className={`t-coach__dot ${dotClass}`} />}
      <span>{text || " "}</span>
    </p>
  );
}
