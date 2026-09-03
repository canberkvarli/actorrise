"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useSpring } from "framer-motion";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SpotlightSurface } from "@/components/brand/SpotlightSurface";
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
import { FlowingLine } from "@/components/landing/v2/FlowingLine";
import { GhostLightAppTeaser } from "@/components/landing/v2/GhostLightAppTeaser";
import { InkStatement } from "@/components/landing/v2/InkStatement";
import { SpotlightHero } from "@/components/landing/v2/SpotlightHero";
import { ThreeActs } from "@/components/landing/v2/ThreeActs";
import { TitleMarquee } from "@/components/landing/v2/TitleMarquee";
import { AppLaunchBar } from "@/components/landing/AppLaunchBar";

/** Courier "stage direction" eyebrow above the light sections */
function SceneMark({ children }: { children: string }) {
  return (
    <p className="stage-direction text-center text-sm sm:text-base md:text-lg text-muted-foreground/70 pt-14 sm:pt-20">
      {children}
    </p>
  );
}

export function LandingGhostLight() {
  // Header settles once you leave the top: darker glass, a soft edge shadow.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A thin beam of light under the header tracks reading progress.
  const { scrollYProgress } = useScroll();
  const beam = useSpring(scrollYProgress, { stiffness: 90, damping: 25, restDelta: 0.001 });

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      {/* Above the sticky header, in normal flow, so it scrolls away and leaves
          the header to stick at top-0 on its own. Anchoring it to the viewport
          instead would mean every sticky offset on the page had to know its
          height. */}
      <AppLaunchBar />

      {/* Header lives on the stage: always dark, floats over every scene.
          The cursor spotlight tracks across it like the hero. wash + overflow
          off so the glow stays subtle and the mobile-nav dropdown isn't clipped. */}
      <SpotlightSurface
        as="header"
        wash={false}
        overflowHidden={false}
        className={`dark sticky top-0 z-20 border-b border-[var(--stage-line)] backdrop-blur-md text-[var(--stage-fg)] animate-header-enter transition-[background-color,box-shadow] duration-500 ${
          scrolled
            ? "bg-[color-mix(in_oklab,var(--stage)_94%,transparent)] shadow-[0_10px_35px_-15px_rgba(0,0,0,0.6)]"
            : "bg-[color-mix(in_oklab,var(--stage)_84%,transparent)]"
        }`}
      >
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-4">
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
        <motion.div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-px origin-left bg-gradient-to-r from-primary/70 via-primary to-primary/70 shadow-[0_0_8px_var(--stage-glow)]"
          style={{ scaleX: beam }}
        />
      </SpotlightSurface>

      <main>
        {/* ACT 0 — the dark stage */}
        <div className="dark stage-scene">
          <SpotlightHero />
          <FlowingLine />
          <TitleMarquee />
          <ThreeActs />
        </div>

        {/* House lights up — the product, in daylight */}
        <div aria-hidden className="stage-footlights" />
        <div id="watch">
          <SceneMark>(house lights up.)</SceneMark>
          <LandingVideoShowcase />
        </div>

        <div>
          <SceneMark>(now you try.)</SceneMark>
          <LandingSearchShowcase />
        </div>

        <InkStatement />

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

        {/* Final scenes — back to the dark: the app, then the ghost light */}
        <div aria-hidden className="stage-footlights" />
        <div className="dark stage-scene">
          <GhostLightAppTeaser />
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
