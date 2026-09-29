"use client";

import { motion } from "framer-motion";
import type { ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";
import { renderTextWithStageDirections } from "@/lib/stageDirections";
import type { CoachState } from "@/lib/guided-coach";

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
  coach: CoachState;
  /** Mic blocked or recognition broken: the button is the only way through. */
  tapMode: boolean;
  isUserTurn: boolean;
  isTranscribing: boolean;
  shouldShake: boolean;
  onSaidIt: () => void;
  /** The quiet way past a line that will not come. Same action, softer ask. */
  onSkip: () => void;
  /** The door. Replaces the control pill's X on the first scene. */
  onLeave: () => void;
  currentLineRef: RefObject<HTMLDivElement | null>;
}

/**
 * The guided first scene's stage: six lines, one column, phone first.
 *
 * The full rehearsal page sets a script in the typewriter face inside a
 * parchment card, with avatars, "(You)" pills and a waveform row per line.
 * That is a working document for someone running their own sides. A first
 * scene is a page you read once, so this is the display serif, a cue above
 * each line, the actor's cue in the theatre orange, and nothing else.
 *
 * No waveform. It was the one ornament, a row of bars under the current line,
 * and it made the scene look like a phone call. The words themselves already
 * move: the partner's light as they are spoken, the actor's underline as they
 * are heard, and the dot in the coaching line says the mic is open.
 */
export function GuidedStage({
  lines,
  isUserLine,
  activeIndex,
  renderUserLine,
  renderPartnerLine,
  coach,
  tapMode,
  isUserTurn,
  isTranscribing,
  shouldShake,
  onSaidIt,
  onSkip,
  onLeave,
  currentLineRef,
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
            {showSaidIt ? (
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
            ) : (
              isCurrent &&
              isUser &&
              isUserTurn &&
              !isTranscribing && (
                <button
                  type="button"
                  className="g-skip"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSkip();
                  }}
                >
                  skip this line
                </button>
              )
            )}
          </motion.div>
        );
      })}
      <button type="button" className="g-leave" onClick={onLeave}>
        leave the scene
      </button>
    </div>
  );
}
