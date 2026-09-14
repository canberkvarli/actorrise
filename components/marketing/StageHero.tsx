import type { ReactNode } from "react";

/**
 * The hero band on every marketing page, in the landing's voice.
 *
 * It speaks Theatre Walk: ink ground, a Courier stage direction, an Instrument
 * Serif title with the italic carrying the accent, and a footlight strip along
 * the bottom edge that hands off to the page below. It is always dark, in both
 * themes, exactly like the landing's hero — the content underneath stays
 * theme-aware, so a visitor reading a long guide in dark mode still gets it.
 *
 * The `--t-*` tokens and the three faces come from `.theatre-tokens` on the
 * marketing layout root, so nothing here needs its own palette.
 */
export function StageHero({
  direction,
  title,
  lede,
  children,
  align = "center",
}: {
  /** Typewriter eyebrow, e.g. "(the ticket.)" — parentheses included by caller */
  direction: string;
  title: ReactNode;
  lede?: ReactNode;
  /** Optional CTA row rendered under the lede */
  children?: ReactNode;
  align?: "center" | "left";
}) {
  const centered = align === "center";

  return (
    <section
      className={`relative isolate overflow-hidden ${centered ? "text-center" : ""}`}
      style={{ background: "var(--t-ink)", color: "var(--t-cream)" }}
    >
      {/* One warm wash off the top corner, so the band is lit rather than flat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 90% at 50% -10%, oklch(0.72 0.17 55 / .16), transparent 70%)",
        }}
      />
      <div
        className={`container relative mx-auto px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24 ${
          centered ? "flex flex-col items-center" : ""
        }`}
      >
        <p className="t-dir t-rise" style={{ color: "var(--t-muted-light)" }}>
          {direction}
        </p>

        <h1
          className="t-rise mt-4 max-w-3xl sm:mt-5"
          style={
            {
              "--t-d": ".12s",
              fontFamily: "var(--t-display)",
              fontWeight: 400,
              lineHeight: 0.98,
              letterSpacing: "-0.02em",
              fontSize: "clamp(2.4rem, 5.5vw, 4.4rem)",
              textWrap: "balance",
            } as React.CSSProperties
          }
        >
          {title}
        </h1>

        {lede ? (
          <p
            className="t-rise mt-5 max-w-2xl"
            style={
              {
                "--t-d": ".24s",
                fontFamily: "var(--t-body)",
                fontSize: "clamp(16px, 1.2vw, 18px)",
                lineHeight: 1.5,
                color: "var(--t-muted-light-3)",
              } as React.CSSProperties
            }
          >
            {lede}
          </p>
        ) : null}

        {children ? (
          <div
            className={`t-rise mt-8 flex flex-wrap items-center gap-3 ${
              centered ? "justify-center" : ""
            }`}
            style={{ "--t-d": ".36s" } as React.CSSProperties}
          >
            {children}
          </div>
        ) : null}
      </div>

      {/* Footlights. Dimmer than the landing's: there the strip closes a full
          screen of blackout and can afford to be a lamp, here it is a seam
          between two sections a few hundred pixels apart, and at full gel it
          read as a drawn line rather than light. A warm hairline instead. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          height: 1,
          background:
            "linear-gradient(to right, transparent, oklch(0.72 0.17 55 / .4) 25%, oklch(0.8 0.15 72 / .55) 50%, oklch(0.72 0.17 55 / .4) 75%, transparent)",
          boxShadow: "0 0 18px 2px oklch(0.72 0.17 55 / .18)",
        }}
      />
    </section>
  );
}
