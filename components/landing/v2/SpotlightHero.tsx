import { GhostLight } from "@/components/brand/GhostLight";
import { HeroCta } from "@/components/landing/HeroCta";
import { LandingLiveCount } from "@/components/landing/LandingLiveCount";
import { SpotlightSurface } from "@/components/brand/SpotlightSurface";
import { StageMotes } from "@/components/landing/v2/StageMotes";
import { APP_STORE_URL } from "@/components/landing/v2/GhostLightAppTeaser";

/**
 * Ghost Light hero: a dark stage, one spotlight that follows the cursor,
 * and the headline rising line by line like a curtain going up.
 */
export function SpotlightHero() {
  return (
    <SpotlightSurface as="section" flicker className="stage-grain" aria-label="ActorRise introduction">
      <StageMotes />
      <div className="container mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-20 md:pt-36 md:pb-24 text-center">
        {/* The one light, then the stage direction naming it */}
        <div className="flex justify-center animate-stage-rise">
          <GhostLight size="sm" />
        </div>
        <p
          className="mt-4 stage-direction text-xs sm:text-sm text-[var(--stage-muted)] animate-stage-rise"
          style={{ animationDelay: "0.05s" }}
        >
          (a bare stage. one light. you.)
        </p>

        <h1 className="mt-6 sm:mt-8 pb-2 font-brand font-medium leading-[1.25] text-[2.4rem] sm:text-5xl md:text-6xl lg:text-[4.6rem] mx-auto">
          <span className="block overflow-hidden">
            <span className="block animate-stage-rise" style={{ animationDelay: "0.15s" }}>
              Find your <em className="not-italic sm:italic text-primary">monologue</em> in seconds.
            </span>
          </span>
          <span className="block overflow-hidden">
            <span className="block animate-stage-rise" style={{ animationDelay: "0.3s" }}>
              Spend your time <em className="italic text-primary">rehearsing</em>.
            </span>
          </span>
        </h1>

        <p
          className="mt-6 sm:mt-8 max-w-2xl mx-auto text-sm sm:text-base md:text-lg text-[var(--stage-muted)] leading-relaxed animate-stage-rise"
          style={{ animationDelay: "0.45s" }}
        >
          AI search across 8,500+ monologues from plays, film, and TV. Then run
          your lines with a scene partner that never cancels on you.
        </p>

        <div
          className="mt-9 sm:mt-11 flex flex-col items-center gap-4 animate-stage-rise"
          style={{ animationDelay: "0.6s" }}
        >
          <HeroCta />
          {/* A second, smaller yes.
              The app is free, which makes it the lowest-commitment way into any
              of this — no signup, no card. It only lived in section 11 of 13,
              eight screens down and one screen after the pricing table, which is
              a strange place to put the free thing. This is deliberately weightless:
              the hero converts on "start rehearsing", and an iOS link that
              competed with it would trade the main conversion for a smaller one. */}
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[var(--stage-faint)]">
            <a
              href="#watch"
              className="stage-direction transition-colors hover:text-[var(--stage-muted)]"
            >
              (or watch how it works)
            </a>
            <span aria-hidden className="opacity-50">·</span>
            {/* The styling is spelled out rather than borrowing .stage-direction,
                which force-lowercases: it rendered "(on ios)". That class is for
                invented asides, and it mangles anything with a proper noun in
                it — the same way it would mangle "The Seagull". */}
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-typewriter italic tracking-wide transition-colors hover:text-[var(--stage-muted)]"
            >
              (on iOS)
            </a>
          </div>
        </div>

        <div
          className="mt-12 sm:mt-14 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10 md:gap-12 animate-stage-rise"
          style={{ animationDelay: "0.75s" }}
        >
          <LandingLiveCount variant="inline" />
        </div>
      </div>
    </SpotlightSurface>
  );
}
