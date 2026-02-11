"use client";

import { parseMonologueText } from "@/lib/monologueText";
import { cn } from "@/lib/utils";

export interface MonologueTextProps {
  text: string;
  className?: string;
  /** Base class for the wrapper (e.g. for whitespace-pre-wrap, leading) */
  wrapperClassName?: string;
  /** Stage directions (parentheticals): e.g. italic muted */
  stageClassName?: string;
  /** Quoted dialogue: e.g. italic with subtle border */
  dialogueClassName?: string;
}

const defaultStageClassName = "italic text-muted-foreground";
const defaultDialogueClassName = "italic text-foreground/90 border-l-2 border-primary/30 pl-2 ml-0.5";

/**
 * Renders monologue text with styled segments:
 * - (parentheticals) → stage directions (italic, muted)
 * - "quoted" / 'quoted' → dialogue (italic, subtle left border)
 */
export function MonologueText({
  text,
  className,
  wrapperClassName,
  stageClassName = defaultStageClassName,
  dialogueClassName = defaultDialogueClassName,
}: MonologueTextProps) {
  const segments = parseMonologueText(text);

  return (
    <span className={cn("whitespace-pre-wrap", wrapperClassName, className)}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.content}</span>;
        }
        if (seg.type === "stage") {
          return (
            <span key={i} className={cn(stageClassName)} title="Stage direction">
              {seg.content}
            </span>
          );
        }
        return (
          <span key={i} className={cn(dialogueClassName)} title="Dialogue">
            {seg.content}
          </span>
        );
      })}
    </span>
  );
}
