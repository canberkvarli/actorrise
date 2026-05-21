"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { motion } from "framer-motion";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingVideoShowcase } from "@/components/landing/LandingVideoShowcase";
import { LandingSearchShowcase } from "@/components/landing/LandingSearchShowcase";
import { LandingStickyCta } from "@/components/landing/LandingStickyCta";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { LandingLiveCount } from "@/components/landing/LandingLiveCount";
import { HeroProofBar } from "@/components/landing/LandingTrustBar";
import { HeroCta } from "@/components/landing/HeroCta";
import { RevealSection } from "@/components/landing/RevealSection";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";

const easing = [0.25, 0.1, 0.25, 1] as const;
const duration = 0.45;
const item = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration, ease: easing },
  },
};

export function LandingPageAnimated() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header
        className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 animate-header-enter"
      >
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-3.5">
          <div className="flex items-center gap-4">
            {/* Left: logo */}
            <div className="flex items-center">
              <Link
                href="/"
                className="flex items-center shrink-0 min-w-0 text-foreground hover:opacity-85 transition-opacity"
                aria-label="ActorRise home"
              >
                <BrandLogo size="header" />
              </Link>
            </div>

            {/* Center: primary nav (desktop only), gets flexible space so it can truly center */}
            <div className="hidden lg:flex lg:flex-1 items-center justify-center min-w-0">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-card/60 px-1.5 py-1 whitespace-nowrap">
                <Link href="#pricing" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Pricing
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="/for-students" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Students
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="/for-teachers" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Teachers
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <ContactModalTrigger className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90">
                  Contact
                </ContactModalTrigger>
              </div>
            </div>

            {/* Right: mobile menu + auth actions */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 ml-auto">
              <LandingMobileNav />
              <LandingHeaderActions />
            </div>
          </div>
        </div>
      </header>

      <main>
        <motion.section
          id="suite"
          variants={item}
          initial="hidden"
          animate="visible"
          transition={{ duration, ease: easing, delay: 0.1 }}
          className="container mx-auto px-4 sm:px-6 pt-16 pb-12 md:pt-24 md:pb-16 flex flex-col items-center"
        >
          <div className="max-w-4xl w-full mx-auto text-center">
            <h1 className="text-[2rem] sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-[-0.03em] max-w-3xl mx-auto">
              Find your <span className="hero-keyword">monologue</span> in 20&nbsp;seconds.
              <br className="hidden sm:block" />
              {" "}Spend your time <span className="hero-keyword">rehearsing</span>.
            </h1>


            {/* Large Primary CTA */}
            <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
              <HeroCta />
              <HeroProofBar />
            </div>

            {/* Trust signals — right under stars */}
            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10 md:gap-12">
              <LandingLiveCount variant="inline" />
            </div>
          </div>
        </motion.section>

        <LandingVideoShowcase />

        <LandingSearchShowcase />

        {/* Testimonials */}
        <RevealSection id="testimonials">
          <LandingTestimonials />
        </RevealSection>

        <RevealSection as="div">
          <LandingFaq />
        </RevealSection>

        <RevealSection as="div">
          <LandingPricing />
        </RevealSection>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActorRise</p>
              <span className="text-muted-foreground/40">·</span>
              <p className="text-sm text-muted-foreground/70">Built by an actor, for actors.</p>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-4">
              <Link href="/about" className="hover:text-foreground transition-colors">
                About
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <ContactModalTrigger className="hover:text-foreground">
                Contact
              </ContactModalTrigger>
              <LandingFooterAuthLink />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/50">
            <Link href="/monologue-finder" className="hover:text-muted-foreground transition-colors">Monologue finder</Link>
            <Link href="/audition-monologues" className="hover:text-muted-foreground transition-colors">Audition monologues</Link>
            <Link href="/audition-ai" className="hover:text-muted-foreground transition-colors">Audition AI</Link>
            <Link href="/sources" className="hover:text-muted-foreground transition-colors">Sources & copyright</Link>
            <Link href="/for-students" className="hover:text-muted-foreground transition-colors">For students</Link>
            <Link href="/for-teachers" className="hover:text-muted-foreground transition-colors">For teachers</Link>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky CTA - appears on scroll */}
      <LandingStickyCta />
    </div>
  );
}
