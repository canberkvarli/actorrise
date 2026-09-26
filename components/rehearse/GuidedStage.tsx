"use client";

import { motion } from "framer-motion";
import type { ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";
import { renderTextWithStageDirections } from "@/lib/stageDirections";
import type { CoachState } from "@/lib/guided-coach";
import { AudioWaveform } from "@/components/scenepartner/AudioWaveform";
import { TTSWaveform } from "@/components/scenepartner/TTSWaveform";

export interface GuidedLine {
  id: number;
  text: string;
  character_name: string;
}

interface Props {
  lines: GuidedLine[];
  isUserLine: (characterName: string) => boolean;
  activeIndex: number | null;
  /** Live word underline for the current actor line, or the plain text. */
  renderUserLine: (text: string) => ReactNode;
  /** The spoken sweep for the current partner line, or the plain text. */
  renderPartnerLine: (text: string) => ReactNode;
  isListening: boolean;
  partnerSpeaking: boolean;
  partnerLoading: boolean;
  coach: CoachState;
  /** Mic blocked or recognition broken: the button is the only way through. */
  tapMode: boolean;
  isUserTurn: boolean;
  isTranscribing: boolean;
  shouldShake: boolean;
  onSaidIt: () => void;
  currentLineRef: RefObject<HTMLDivElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  aiAudioElement: HTMLAudioElement | null;
}

/**
 * The guided first scene's stage: six lines, one column, phone first.
 *
 * The full rehearsal page sets a script in the typewriter face inside a
 * parchment card, with avatars, "(You)" pills and a waveform row per line.
 * That is a working document for someone running their own sides. A first
 * scene is a page you read once, so this is the display serif, a cue above
 * each line, the actor's cue in the theatre orange, and nothing else. The
 * current line carries the only ornament: a thin waveform saying the room
 * hears you, or that the partner is speaking.
 */
export function GuidedStage({
  lines,
  isUserLine,
  activeIndex,
  renderUserLine,
  renderPartnerLine,
  isListening,
  partnerSpeaking,
  partnerLoading,
  coach,
  tapMode,
  isUserTurn,
  isTranscribing,
  shouldShake,
  onSaidIt,
  currentLineRef,
  analyserRef,
  aiAudioElement,
}: Props) {
  return (
    <div className="g-stage">
      {lines.map((line, i) => {
        const isUser = isUserLine(line.character_name);
        const isCurrent = i === activeIndex;
        const past = activeIndex != null && i < activeIndex;
        const showSaidIt =
          isCurrent && isUser && isUserTurn && !isTranscribing && (tapMode || coach === "nudge");
        return (
          <motion.div
            key={line.id}
            data-line-index={i}
            ref={isCurrent ? currentLineRef : undefined}
            initial={false}
            animate={
              isCurrent && isUser && shouldShake
                ? { x: [-8, 8, -6, 6, -4, 4, 0], opacity: 1 }
                : { x: 0, opacity: isCurrent ? 1 : past ? 0.38 : 0.6 }
            }
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn("g-line", isUser && "g-line--you", isCurrent && "g-line--now", past && "g-line--past")}
          >
            <p className="g-cue">
              <span>{line.character_name}</span>
              {isUser && <span className="g-cue__you">you</span>}
            </p>
            <p className="g-text">
              {isCurrent && isUser
                ? renderUserLine(line.text)
                : isCurrent
                  ? renderPartnerLine(line.text)
                  : renderTextWithStageDirections(line.text)}
            </p>
            {isCurrent && (
              <div className="g-wave" aria-hidden>
                {isUser ? (
                  <AudioWaveform analyserRef={analyserRef} active={isListening} className="w-24 h-3" />
                ) : (
                  <TTSWaveform
                    audioElement={aiAudioElement}
                    isLoading={partnerLoading}
                    isSpeaking={partnerSpeaking}
                    className="w-24 h-3"
                  />
                )}
              </div>
            )}
            {showSaidIt && (
              <button
                type="button"
                className="g-said"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaidIt();
                }}
              >
                {tapMode ? "I said it" : "Move on"}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
