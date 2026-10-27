/**
 * Cue's mark: an italic Q over an orange rule, from the Claude Design spec
 * (2026-10-28). Always cream on an ink disc, never on paper, so the colours
 * are fixed rather than currentColor. The face is Instrument Serif via
 * --font-theatre-display, which needs theatreFontVars bound on an ancestor
 * (Cue's root carries it).
 */
export function CueMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className={className}>
      <text
        x="24"
        y="30"
        textAnchor="middle"
        fontStyle="italic"
        fontSize="33"
        fill="var(--t-cream)"
        style={{ fontFamily: "var(--font-theatre-display)" }}
      >
        Q
      </text>
      <path d="M13 44 H35" stroke="var(--t-orange)" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
