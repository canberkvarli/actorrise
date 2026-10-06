import { voiceMark } from "@/lib/voiceMarks";

/**
 * A voice, drawn as four bars.
 *
 * Replaces the character's own initial in the cue line. An H beside HORATIO is
 * the same word twice; what an actor cannot read off the page is which of the
 * ten voices the partner will use, and whether two characters have been handed
 * the same one.
 *
 * Inherits `currentColor`, so the cue line's cast colour carries it and this
 * component owns no palette of its own.
 */
export function VoiceMark({
  voiceId,
  label,
  size = 14,
  className,
}: {
  voiceId: string | null | undefined;
  /** The voice's name, for assistive tech. The shape alone is not a label. */
  label?: string;
  size?: number;
  className?: string;
}) {
  const mark = voiceMark(voiceId);
  const w = 4;
  const gap = 2.4;
  const box = w * 4 + gap * 3;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} 20`}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label ? `${label} voice` : undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {mark.bars.map((h, i) => {
        const barH = Math.max(3, h * 18);
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            // Grown from the middle, so a quiet voice reads as small rather
            // than as sitting on the floor of the box.
            y={(20 - barH) / 2}
            width={w}
            height={barH}
            rx={1.2}
            fill="currentColor"
            // The tallest bar is the voice's character; the rest support it.
            opacity={0.45 + h * 0.55}
          />
        );
      })}
    </svg>
  );
}
