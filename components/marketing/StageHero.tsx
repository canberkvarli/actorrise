import type { ReactNode } from "react";

/**
 * Shared marketing-page hero: a dark stage band with a typewriter
 * stage-direction eyebrow and a big serif title. Content below the band
 * stays theme-aware; the stage itself is always dark.
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
      className={`dark stage-scene relative isolate overflow-hidden stage-grain ${
        centered ? "text-center" : ""
      }`}
    >
      <div aria-hidden className="absolute inset-0 -z-10 stage-wash" />
      <div
        className={`container mx-auto px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 ${
          centered ? "flex flex-col items-center" : ""
        }`}
      >
        <p className="stage-direction text-xs sm:text-sm text-[var(--stage-muted)] animate-stage-rise">
          {direction}
        </p>
        <h1
          className="mt-4 sm:mt-5 font-serif font-medium leading-[1.06] tracking-[-0.03em] text-3xl sm:text-5xl md:text-[3.4rem] max-w-3xl text-balance animate-stage-rise"
          style={{ animationDelay: "0.12s" }}
        >
          {title}
        </h1>
        {lede ? (
          <p
            className="mt-4 sm:mt-5 max-w-2xl text-sm sm:text-base text-[var(--stage-muted)] leading-relaxed animate-stage-rise"
            style={{ animationDelay: "0.24s" }}
          >
            {lede}
          </p>
        ) : null}
        {children ? (
          <div
            className={`mt-7 flex flex-wrap items-center gap-3 animate-stage-rise ${
              centered ? "justify-center" : ""
            }`}
            style={{ animationDelay: "0.36s" }}
          >
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
