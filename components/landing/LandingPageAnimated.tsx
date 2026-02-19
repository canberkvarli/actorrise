"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingValueProps } from "@/components/landing/LandingValueProps";
import { LandingDemoSearch } from "@/components/landing/LandingDemoSearch";
import { LandingMobileNav } from "@/components/landing/LandingMobileNav";
import { LandingHeaderActions } from "@/components/landing/LandingHeaderActions";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooterAuthLink } from "@/components/landing/LandingFooterAuthLink";
import { LandingLiveCount } from "@/components/landing/LandingLiveCount";
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
        className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      >
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2.5 text-foreground hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="ActorRise" width={32} height={32} className="rounded-md" />
                <span className="font-brand text-2xl font-semibold text-foreground">ActorRise</span>
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2 py-1">
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
              <Link href="/for-teachers" className="px-3 py-1.5 text-sm text-foreground/90 hover:text-foreground transition-colors">
                For teachers
              </Link>
              <span className="h-4 w-px bg-border/60" />
              <ContactModalTrigger className="px-3 py-1.5 text-sm text-foreground/90">
                Contact
              </ContactModalTrigger>
            </div>
            <div className="flex items-center gap-2">
              <LandingMobileNav />
              <LandingHeaderActions />
            </div>
          </div>
        </div>
      </motion.header>

      <main>
        <motion.section
          id="suite"
          variants={item}
          className="container mx-auto px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28 flex flex-col items-center"
        >
          <div className="max-w-2xl w-full mx-auto text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Search engine · 8,600+ real scripts · not AI-generated
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl leading-[1.02] tracking-[-0.04em]">
              Find the <span className="hero-keyword">monologue</span>. In seconds.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground">
              Real monologues by playwrights. Not AI-generated.
            </p>
            <div className="mt-8">
              <LandingDemoSearch />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free tier · No credit card required
            </p>
            <div className="mt-8 w-full">
              <LandingLiveCount variant="inline" />
            </div>
          </div>
        </motion.section>

        <motion.section
          variants={item}
          className="border-t border-border/40 bg-muted/20 py-10 md:py-12"
          aria-label="Social proof"
        >
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-4xl mx-auto">
              <p className="text-center font-medium text-foreground text-lg md:text-xl">
                Actors are already using ActorRise to find audition pieces in seconds.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-4 sm:gap-8">
                <p className="text-center sm:text-left text-sm md:text-base text-muted-foreground border-l-2 border-primary/30 pl-4 py-1">
                  &ldquo;I had a shortlist in under a minute.&rdquo; <span className="text-muted-foreground/80">Actor, drama school audition</span>
                </p>
                <p className="text-center sm:text-left text-sm md:text-base text-muted-foreground border-l-2 border-primary/30 pl-4 py-1">
                  &ldquo;Found a scene for a film callback in seconds.&rdquo; <span className="text-muted-foreground/80">Actor, screen</span>
                </p>
              </div>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="#testimonials"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  See what actors are saying →
                </Link>
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          id="how"
          variants={item}
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

        <motion.div variants={item}>
          <LandingValueProps />
        </motion.div>

        <motion.section variants={item} id="testimonials">
          <LandingTestimonials />
        </motion.section>

        <motion.div variants={item}>
          <LandingFaq />
        </motion.div>

        <motion.div variants={item}>
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
    </motion.div>
  );
}
