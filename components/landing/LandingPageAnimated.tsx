"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { motion } from "framer-motion";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingFeatureShowcase } from "@/components/landing/LandingFeatureShowcase";
import { LandingStickyCta } from "@/components/landing/LandingStickyCta";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { LandingLiveCount } from "@/components/landing/LandingLiveCount";
import { HeroProofBar } from "@/components/landing/LandingTrustBar";
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
                <Link href="#suite" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Search
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="#pricing" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Pricing
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="/for-students" className="px-2.5 py-1.5 text-xs lg:text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Students
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

      {/* Founding Member Urgency Banner */}
      <motion.div
        variants={item}
        initial="hidden"
        animate="visible"
        transition={{ duration, ease: easing }}
        className="border-b border-primary/20 bg-primary/5 py-3"
      >
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm font-medium">
            <span className="hidden sm:inline">🔥 Limited: </span>
            <span className="font-semibold">50 founding member spots remaining.</span>
            {" "}100% off for 12 months.{" "}
            <Link href="/pricing" className="underline hover:no-underline font-semibold">
              Claim your spot →
            </Link>
          </p>
        </div>
      </motion.div>

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
            <div className="mb-4 sm:mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Monologues, scenes & film/TV
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-[-0.03em] max-w-3xl mx-auto">
              Find your <span className="hero-keyword">monologue</span> in 20&nbsp;seconds.
              <br />
              Spend your time <span className="hero-keyword">rehearsing</span>.
            </h1>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              8,600+ theatrical monologues + 14,000 film & TV scenes. AI-powered search.
            </p>

            {/* Large Primary CTA */}
            <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
              <Button asChild size="lg" className="h-14 sm:h-16 px-10 sm:px-14 text-base sm:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all">
                <Link href="/search">Try Free Search</Link>
              </Button>
              <HeroProofBar />
            </div>

            {/* Trust signals — right under stars */}
            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10 md:gap-12">
              <a
                href="https://www.producthunt.com/products/actorrise?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-actorrise"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block opacity-90 hover:opacity-100 transition-opacity"
                aria-label="ActorRise on Product Hunt"
              >
                <img
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1078076&theme=dark&t=1772064638507"
                  alt="ActorRise - Find the perfect monologue in less than 20 seconds | Product Hunt"
                  width={250}
                  height={54}
                  className="h-[40px] sm:h-[54px] w-auto"
                />
              </a>
              <LandingLiveCount variant="inline" />
            </div>
          </div>
        </motion.section>

        {/* Testimonials - moved up for better social proof placement */}
        <RevealSection id="testimonials">
          <LandingTestimonials />
        </RevealSection>

        <RevealSection id="how" className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-5xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Get back to what matters: <span className="italic underline underline-offset-2 decoration-primary/60">performing.</span>
            </h2>
            <p className="mt-2 text-muted-foreground text-lg">Three steps.</p>
            <div className="mt-12 grid md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">01</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Search</h3>
                <p className="mt-3 text-foreground/85">
                  Describe what you need. Get a shortlist.
                </p>
              </div>
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">02</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Save</h3>
                <p className="mt-3 text-foreground/85">
                  Bookmark what you like.
                </p>
              </div>
              <div className="rounded-xl border border-border p-8">
                <div className="text-base text-foreground/80">03</div>
                <h3 className="mt-3 text-2xl tracking-[-0.02em]">Rehearse</h3>
                <p className="mt-3 text-foreground/85">
                  Walk in ready.
                </p>
              </div>
            </div>
          </div>
        </RevealSection>

        <RevealSection className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60">
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Give casting directors <span className="font-semibold text-primary">something different.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              The Overdone filter helps you show up with pieces they haven’t seen a hundred times.
            </p>
          </div>
        </RevealSection>

        <RevealSection as="div">
          <LandingFeatureShowcase />
        </RevealSection>

        <RevealSection as="div">
          <LandingFaq />
        </RevealSection>

        <RevealSection as="div">
          <LandingPricing />
        </RevealSection>
      </main>

      <footer className="border-t border-border/60">
        <div className="container mx-auto px-4 sm:px-6 py-10 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground/90 max-w-xl">
            All text from public domain and licensed sources (e.g.{" "}
            <Link href="/sources" className="underline hover:no-underline text-foreground/80">
              Project Gutenberg
            </Link>
            ); we don&apos;t distribute copyrighted play text.
          </p>
          <p className="text-xs text-muted-foreground/90 max-w-xl">
            We don&apos;t sell your data. Your searches are private.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ActorRise</p>
              <p className="text-xs text-muted-foreground/80">Built by an actor, for actors.</p>
            </div>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-4">
              <Link href="/monologue-finder" className="hover:text-foreground transition-colors">
                Monologue finder
              </Link>
              <Link href="/audition-monologues" className="hover:text-foreground transition-colors">
                Audition monologues
              </Link>
              <Link href="/audition-ai" className="hover:text-foreground transition-colors">
                Audition AI
              </Link>
              <Link href="/about" className="hover:text-foreground transition-colors">
                About
              </Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link href="/sources" className="hover:text-foreground transition-colors">
                Sources & copyright
              </Link>
              <Link href="/pricing" className="hover:text-foreground transition-colors">
                Pricing
              </Link>
              <Link href="/for-students" className="hover:text-foreground transition-colors">
                For students
              </Link>
              <Link href="/for-teachers" className="hover:text-foreground transition-colors">
                For teachers
              </Link>
              <ContactModalTrigger className="hover:text-foreground">
                Contact
              </ContactModalTrigger>
              <LandingFooterAuthLink />
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Sticky CTA - appears on scroll */}
      <LandingStickyCta />
    </div>
  );
}
