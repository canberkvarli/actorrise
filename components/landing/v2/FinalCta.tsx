import { HeroCta } from "@/components/landing/HeroCta";

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
        <div aria-hidden className="relative flex flex-col items-center animate-ghost-flicker">
          <div className="relative">
            <span className="block h-3.5 w-3.5 rounded-full bg-[var(--stage-glow)]" />
            <span
              className="absolute -inset-8 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--stage-glow) 38%, transparent) 0%, transparent 70%)",
              }}
            />
          </div>
          <span className="mt-1 h-16 w-px bg-gradient-to-b from-[var(--stage-line)] to-transparent" />
        </div>

        <p className="stage-direction mt-6 text-xs sm:text-sm text-[var(--stage-muted)]">
          (the ghost light stays on. the stage is never empty.)
        </p>

        <h2 className="mt-5 font-serif font-medium tracking-[-0.03em] leading-[1.05] text-3xl sm:text-5xl md:text-6xl max-w-3xl text-balance">
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
