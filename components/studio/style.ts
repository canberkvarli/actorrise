/**
 * The Studio's design tokens. Its own look, not ActorRise's, in Linear's spirit:
 * black and white, Inter, hairlines, small crisp controls. Colour is reserved for heat
 * (lib/studio/heat.ts): only a strong, sudden movement earns it.
 */

export const T = {
  void: "#000000", // the stage
  surface: "rgba(15, 15, 16, 0.94)", // sheets and the bar
  raised: "rgba(255, 255, 255, 0.05)", // a control at rest
  hover: "rgba(255, 255, 255, 0.09)",
  line: "rgba(255, 255, 255, 0.08)", // hairlines
  lineStrong: "rgba(255, 255, 255, 0.16)",
  text: "#ededed",
  text2: "#8f8f8f",
  text3: "#5c5c5c",
  primary: "#ededed", // the one filled control on a surface
  onPrimary: "#000000",
} as const;

/** Headlines and the action's name: Inter, its display cut, tight. */
export const display = {
  fontFamily: "var(--font-studio), system-ui, sans-serif",
  fontWeight: 500,
  letterSpacing: "-0.02em",
} as const;

/** The words of the play. */
export const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;

/** One curve for everything that moves: fast out, soft landing. */
export const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** A small toggle (24px): an option among others. On is lit white, off is quiet. */
export const toggle = (on = false) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    height: 24,
    padding: "0 8px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    border: `1px solid ${on ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)"}`,
    background: on ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.04)",
    color: on ? "#ffffff" : "#a1a1a1",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 120ms, border-color 120ms, color 120ms",
  }) as const;

/** An action button (28px). Primary is the one filled control in a view. */
export const action = (primary = false) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "0 12px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1,
    border: `1px solid ${primary ? "#ededed" : "rgba(255,255,255,0.1)"}`,
    background: primary ? "#ededed" : "rgba(255,255,255,0.05)",
    color: primary ? "#000000" : "#d4d4d4",
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
  }) as const;
