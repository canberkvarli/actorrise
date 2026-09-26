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
}

/**
 * Feeds lib/guided-coach what the rehearse page knows, on a half-second tick
 * while the mic is open (the nudge is a function of time, and the page has no
 * event for "six seconds passed").
 */
export function GuidedCoachLine({ partnerSpeaking, micOpen, linesHeard, voicedThisTake, tapMode, onState }: Props) {
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
      {text || " "}
    </p>
  );
}
