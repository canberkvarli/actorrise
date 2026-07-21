import { HeroCta } from "@/components/landing/HeroCta";
import { GhostLight } from "@/components/brand/GhostLight";

/**
 * Closing scene: the ghost light. A single bulb on a stand, the theatre's
 * way of saying the stage is never really empty.
 */
export function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden stage-grain" aria-label="Get started">
      <div aria-hidden className="absolute inset-0 -z-10 stage-wash" />

      <div className="container mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-24 sm:pb-20 flex flex-col items-center text-center">
        {/* The ghost light */}
        <GhostLight stem />

        <p className="stage-direction mt-6 text-xs sm:text-sm text-[var(--stage-muted)]">
          (the ghost light stays on. the stage is never empty.)
        </p>

        <h2 className="mt-5 pb-1 font-brand font-medium tracking-[-0.02em] leading-[1.2] text-3xl sm:text-5xl md:text-6xl max-w-3xl text-balance">
          Your <em className="italic text-primary">scene partner</em> is already waiting.
        </h2>

        <p className="mt-5 max-w-xl text-sm sm:text-base text-[var(--stage-muted)] leading-relaxed">
          Free to start. Five searches a month, no card. I built this because I
          needed it, and I think you might too.
        </p>

        <div className="mt-8 sm:mt-10">
          <HeroCta />
        </div>
      </div>
    </section>
  );
}
