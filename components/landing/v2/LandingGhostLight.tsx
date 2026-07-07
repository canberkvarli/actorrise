"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingSearchShowcase } from "@/components/landing/LandingSearchShowcase";
import { LandingStickyCta } from "@/components/landing/LandingStickyCta";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingVideoShowcase } from "@/components/landing/LandingVideoShowcase";
import { RevealSection } from "@/components/landing/RevealSection";
import { FinalCta } from "@/components/landing/v2/FinalCta";
import { SpotlightHero } from "@/components/landing/v2/SpotlightHero";
import { ThreeActs } from "@/components/landing/v2/ThreeActs";
import { TitleMarquee } from "@/components/landing/v2/TitleMarquee";

/** Courier "stage direction" eyebrow above the light sections */
function SceneMark({ children }: { children: string }) {
  return (
    <p className="stage-direction text-center text-xs sm:text-sm text-muted-foreground/70 pt-14 sm:pt-20">
      {children}
    </p>
  );
}

export function LandingGhostLight() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header lives on the stage: always dark, floats over every scene */}
      <header className="dark sticky top-0 z-20 border-b border-[var(--stage-line)] bg-[color-mix(in_oklab,var(--stage)_84%,transparent)] backdrop-blur-md text-[var(--stage-fg)] animate-header-enter">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center shrink-0 min-w-0 hover:opacity-85 transition-opacity"
              aria-label="ActorRise home"
            >
              <BrandLogo size="header" onDark />
            </Link>

            <div className="hidden lg:flex lg:flex-1 items-center justify-center min-w-0">
              <nav className="inline-flex items-center gap-0.5 rounded-full border border-[var(--stage-line)] bg-[var(--stage-raised)]/70 px-1.5 py-1 whitespace-nowrap">
                <Link href="#pricing" className="px-2.5 py-1.5 text-xs lg:text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors">
                  Pricing
                </Link>
                <span className="h-4 w-px bg-[var(--stage-line)]" />
                <Link href="/for-students" className="px-2.5 py-1.5 text-xs lg:text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors">
                  Students
                </Link>
                <span className="h-4 w-px bg-[var(--stage-line)]" />
                <Link href="/for-teachers" className="px-2.5 py-1.5 text-xs lg:text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)] transition-colors">
                  Teachers
                </Link>
                <span className="h-4 w-px bg-[var(--stage-line)]" />
                <ContactModalTrigger className="px-2.5 py-1.5 text-xs lg:text-sm text-[var(--stage-muted)] hover:text-[var(--stage-fg)]">
                  Contact
                </ContactModalTrigger>
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-auto">
              <LandingMobileNav />
              <LandingHeaderActions />
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ACT 0 — the dark stage */}
        <div className="dark stage-scene">
          <SpotlightHero />
          <TitleMarquee />
          <ThreeActs />
        </div>

        {/* House lights up — the product, in daylight */}
        <div id="watch">
          <SceneMark>(house lights up.)</SceneMark>
          <LandingVideoShowcase />
        </div>

        <div>
          <SceneMark>(now you try.)</SceneMark>
          <LandingSearchShowcase />
        </div>

        <RevealSection id="testimonials">
          <SceneMark>(the notices.)</SceneMark>
          <LandingTestimonials />
        </RevealSection>

        <RevealSection as="div">
          <SceneMark>(the ticket.)</SceneMark>
          <LandingPricing />
        </RevealSection>

        <RevealSection as="div">
          <SceneMark>(questions from the house.)</SceneMark>
          <LandingFaq />
        </RevealSection>

        {/* Final scene — back to the dark */}
        <div className="dark stage-scene">
          <FinalCta />
        </div>
      </main>

      <footer className="dark stage-scene border-t border-[var(--stage-line)]">
        <div className="container mx-auto px-4 sm:px-6 py-10 flex flex-col gap-5">
          <p className="stage-direction text-xs text-[var(--stage-faint)]">(curtain call.)</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-[var(--stage-muted)]">© {new Date().getFullYear()} ActorRise</p>
              <span className="text-[var(--stage-faint)]">·</span>
              <p className="text-sm text-[var(--stage-faint)]">Built by an actor, for actors.</p>
            </div>
            <div className="text-sm text-[var(--stage-muted)] flex flex-wrap items-center gap-4">
              <Link href="/about" className="hover:text-[var(--stage-fg)] transition-colors">
                About
              </Link>
              <Link href="/pricing" className="hover:text-[var(--stage-fg)] transition-colors">
                Pricing
              </Link>
              <Link href="/privacy" className="hover:text-[var(--stage-fg)] transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-[var(--stage-fg)] transition-colors">
                Terms
              </Link>
              <ContactModalTrigger className="hover:text-[var(--stage-fg)]">
                Contact
              </ContactModalTrigger>
              <LandingFooterAuthLink />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--stage-faint)]">
            <Link href="/monologue-finder" className="hover:text-[var(--stage-muted)] transition-colors">Monologue finder</Link>
            <Link href="/audition-monologues" className="hover:text-[var(--stage-muted)] transition-colors">Audition monologues</Link>
            <Link href="/audition-ai" className="hover:text-[var(--stage-muted)] transition-colors">Audition AI</Link>
            <Link href="/sources" className="hover:text-[var(--stage-muted)] transition-colors">Sources & copyright</Link>
            <Link href="/for-students" className="hover:text-[var(--stage-muted)] transition-colors">For students</Link>
            <Link href="/for-teachers" className="hover:text-[var(--stage-muted)] transition-colors">For teachers</Link>
          </div>
        </div>
      </footer>

      <LandingStickyCta />
    </div>
  );
}
