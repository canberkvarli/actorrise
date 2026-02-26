"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { motion } from "framer-motion";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingFeatureShowcase } from "@/components/landing/LandingFeatureShowcase";
import { LandingStickyCta } from "@/components/landing/LandingStickyCta";
import { LandingDemoSearch } from "@/components/landing/LandingDemoSearch";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { LandingLiveCount } from "@/components/landing/LandingLiveCount";
import { LandingTrustBar } from "@/components/landing/LandingTrustBar";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";

const easing = [0.25, 0.1, 0.25, 1] as const;
const duration = 0.45;
const stagger = 0.06;

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration, ease: easing },
  },
};

/** For scroll-triggered sections: animate in when they enter the viewport */
const viewport = { once: true, amount: 0.15 } as const;

export function LandingPageAnimated() {
  return (
    <motion.div
      className="min-h-screen bg-background overflow-x-hidden"
      initial="hidden"
      animate="visible"
      variants={container}
    >
      <motion.header
        variants={item}
        className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
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
            <div className="hidden md:flex md:flex-1 items-center justify-center">
              <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-1">
                <Link href="#suite" className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Search
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="#how" className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors">
                  How it works
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="#pricing" className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Pricing
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <Link href="/for-students" className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors">
                  Students & educators
                </Link>
                <span className="h-4 w-px bg-border/60" />
                <ContactModalTrigger className="px-3 py-1.5 text-sm text-foreground/90">
                  Contact
                </ContactModalTrigger>
              </div>
            </div>

            {/* Right: mobile menu + auth actions */}
            <div className="flex items-center gap-2 sm:gap-4 md:justify-end shrink-0">
              <LandingMobileNav />
              <LandingHeaderActions />
            </div>
          </div>
        </div>
      </motion.header>

      {/* Founding Member Urgency Banner */}
      <motion.div
        variants={item}
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
          className="container mx-auto px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 flex flex-col items-center"
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
              8,600+ theatrical monologues + 14,000 film & TV scenes. AI search. Free forever.
            </p>

            {/* Large Primary CTA */}
            <div className="mt-8 sm:mt-10 flex flex-col items-center gap-3">
              <Button asChild size="lg" className="h-14 sm:h-16 px-10 sm:px-14 text-base sm:text-lg font-semibold rounded-full shadow-lg hover:shadow-xl transition-all">
                <Link href="/search">Try Free Search</Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Free forever · No credit card required
              </p>
            </div>
          </div>
        </motion.section>

        {/* Trust Bar with social proof */}
        <motion.div
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
        >
          <LandingTrustBar />
        </motion.div>

        {/* Testimonials - moved up for better social proof placement */}
        <motion.section
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
          id="testimonials"
        >
          <LandingTestimonials />
        </motion.section>

        <motion.section
          id="how"
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
          className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60"
        >
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
        </motion.section>

        <motion.section
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
          className="container mx-auto px-4 sm:px-6 py-20 md:py-28 border-t border-border/60"
        >
          <div className="max-w-3xl">
            <h2 className="text-3xl md:text-4xl tracking-[-0.03em]">
              Give casting directors <span className="font-semibold text-primary">something different.</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              The Overdone filter helps you show up with pieces they haven’t seen a hundred times.
            </p>
          </div>
        </motion.section>

        <motion.div
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
        >
          <LandingFeatureShowcase />
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
        >
          <LandingFaq />
        </motion.div>

        <motion.div
          variants={item}
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          transition={{ duration, ease: easing }}
        >
          <LandingPricing />
        </motion.div>
      </main>

      <motion.footer variants={item} className="border-t border-border/60">
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
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://www.producthunt.com/products/actorrise?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-actorrise"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block opacity-80 hover:opacity-100 transition-opacity"
              aria-label="ActorRise on Product Hunt"
            >
              <img
                src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1078076&theme=neutral&t=1771519524232"
                alt="ActorRise on Product Hunt"
                width={200}
                height={43}
                className="h-[43px] w-auto"
              />
            </a>
          </div>
        </div>
      </motion.footer>

      {/* Mobile Sticky CTA - appears on scroll */}
      <LandingStickyCta />
    </motion.div>
  );
}
