type GhostLightSize = "sm" | "md" | "lg";

type GhostLightProps = {
  className?: string;
  /** Draw the stand line falling away below the bulb. */
  stem?: boolean;
  /** Slow ghost-light flicker. Default: true. */
  flicker?: boolean;
  size?: GhostLightSize;
};

const BULB: Record<GhostLightSize, string> = {
  sm: "h-2.5 w-2.5",
  md: "h-3.5 w-3.5",
  lg: "h-5 w-5",
};

const HALO: Record<GhostLightSize, string> = {
  sm: "-inset-6",
  md: "-inset-8",
  lg: "-inset-12",
};

/**
 * The ghost light: a single glowing bulb, the theatre's way of saying the
 * stage is never really empty. Extracted from the landing's closing scene so
 * the same motif can mark empty states, "you" moments, and section beats
 * across the app. Reads only on dark surfaces.
 */
export function GhostLight({ className = "", stem = false, flicker = true, size = "md" }: GhostLightProps) {
  return (
    <div
      aria-hidden
      className={`relative flex flex-col items-center ${flicker ? "animate-ghost-flicker" : ""} ${className}`}
    >
      <div className="relative">
        <span className={`block rounded-full bg-[var(--glow)] ${BULB[size]}`} />
        <span
          className={`absolute rounded-full ${HALO[size]}`}
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--glow) 38%, transparent) 0%, transparent 70%)",
          }}
        />
      </div>
      {stem && <span className="mt-1 h-16 w-px bg-gradient-to-b from-[var(--stage-line)] to-transparent" />}
    </div>
  );
}
