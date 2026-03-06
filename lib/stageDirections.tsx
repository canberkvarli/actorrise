import React from "react";

/**
 * Splits line text that may contain [bracketed stage directions] into
 * an array of React nodes:  plain text + italic (direction) spans.
 *
 * Example:
 *   "[quietly] I'm looking now."
 *   → <em className="...">(quietly)</em> I'm looking now.
 */
export function renderTextWithStageDirections(
  text: string,
  directionClassName = "italic text-neutral-500 text-[0.85em]"
): React.ReactNode {
  // Fast path: no brackets at all
  if (!text.includes("[")) return text;

  const parts: React.ReactNode[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this bracket
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // The stage direction itself
    parts.push(
      <em key={match.index} className={directionClassName}>
        ({match[1]})
      </em>
    );
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last bracket
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

/**
 * Strips [bracketed text] from a string, returning only the dialogue.
 * Useful for word-matching / TTS where stage directions should be excluded.
 */
export function stripStageDirections(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, "").replace(/\s{2,}/g, " ").trim();
}
