"use client";

/**
 * Cue's mark: the stage manager's headset, the thing that calls the cues.
 *
 * Drawn in the same hand as LampSketch (stroke line art, currentColor, round
 * caps) so it belongs to the room, but it is not the lamp: the lamp is the
 * one fixture, and Cue is a person on the comms, not a light.
 *
 * The dot at the end of the boom is the cue light. It reads `--cue-light`
 * (brand primary by default) and is the only filled thing in the drawing.
 * `live` lights it; the sheet sets it while Cue is answering.
 */
export function CueMark({
  size = 28,
  live = false,
  className,
}: {
  size?: number;
  live?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* headband, a touch uneven, like it was drawn rather than set */}
      <path d="M15 33 C14 15 49 13.5 49 32" />
      {/* the one big muff on the left ear */}
      <path d="M10.5 31.5 C10.5 29.5 12 28.5 14 28.5 L17.5 28.5 C19 28.5 20 29.5 20 31 L20 42 C20 43.5 19 44.5 17.5 44.5 L14 44.5 C12 44.5 10.5 43.5 10.5 41.5 Z" />
      {/* the small pad on the right */}
      <path d="M47.5 30 C50.5 30 52 31.5 52 34 L52 37 C52 39.5 50.5 41 47.5 41" />
      {/* boom, out of the muff and round to the mouth */}
      <path d="M17 44.5 C18.5 51 25 54.5 34 53.5" />
      {/* the mic */}
      <path d="M34 51 L38.5 51 C40 51 41 52 41 53.5 C41 55 40 56 38.5 56 L34 56" />
      {/* the cue light */}
      <circle
        cx="46.5"
        cy="53.5"
        r={live ? 3.4 : 2.6}
        fill="var(--cue-light, var(--primary))"
        stroke="none"
        className={live ? "animate-pulse" : undefined}
      />
    </svg>
  );
}
