"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconCheck, IconSparkles, IconMicrophone } from "@tabler/icons-react";
import { LandingWaitlistModal } from "./LandingWaitlistModal";

/**
 * Feature showcase highlighting both Monologue Search (live) and Scene Partner AI (coming soon).
 * Two-column layout with status badges and CTAs.
 */
export function LandingFeatureShowcase() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  return (
    <>
      <section className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 md:py-28 border-t border-border/60">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-10 sm:mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl tracking-[-0.03em]">
              Transform your audition workflow
            </h2>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg text-muted-foreground">Two tools. One platform.</p>
          </div>

          {/* Two-Feature Grid */}
          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-10">
            {/* Monologue Search - LIVE */}
            <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 md:p-10 flex flex-col">
              {/* Live Badge */}
              <div className="inline-flex items-center gap-2 mb-4 self-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/20 px-3 py-1 text-xs font-medium text-green-600 dark:text-green-400">
                  <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                  LIVE NOW
                </span>
              </div>

              {/* Icon & Title */}
              <div className="flex items-center gap-2 sm:gap-3 mb-3">
                <div className="size-10 sm:size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <IconSparkles size={20} className="text-primary sm:w-6 sm:h-6" />
                </div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-[-0.02em]">
                  Monologue Search
                </h3>
              </div>

              <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">
                Discover unique pieces that make casting directors remember you.
              </p>

              {/* Features List */}
              <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 flex-grow">
                <li className="flex items-start gap-2 text-xs sm:text-sm">
                  <IconCheck size={18} className="text-primary shrink-0 mt-0.5 sm:w-5 sm:h-5" />
                  <span><strong>Stand out with unique pieces</strong> — overdone filter included</span>
                </li>
                <li className="flex items-start gap-2 text-xs sm:text-sm">
                  <IconCheck size={18} className="text-primary shrink-0 mt-0.5 sm:w-5 sm:h-5" />
                  <span><strong>Classical to contemporary</strong> — 8,600+ monologues</span>
                </li>
                <li className="flex items-start gap-2 text-xs sm:text-sm">
                  <IconCheck size={18} className="text-primary shrink-0 mt-0.5 sm:w-5 sm:h-5" />
                  <span><strong>Film & TV scenes</strong> — 14,000+ for screen actors</span>
                </li>
                <li className="flex items-start gap-2 text-xs sm:text-sm">
                  <IconCheck size={18} className="text-primary shrink-0 mt-0.5 sm:w-5 sm:h-5" />
                  <span><strong>Natural language search</strong> — describe what you need</span>
                </li>
              </ul>

              {/* CTA */}
              <Button asChild size="lg" className="w-full">
                <Link href="/search">Try Free Search</Link>
              </Button>
            </div>

            {/* Scene Partner AI - COMING SOON */}
            <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 md:p-10 flex flex-col">
              {/* Coming Soon Badge */}
              <div className="inline-flex items-center gap-2 mb-4 self-start">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
                  COMING SOON
                </span>
              </div>

              {/* Icon & Title */}
              <div className="flex items-center gap-3 mb-3">
                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <IconMicrophone size={24} className="text-primary" />
                </div>
                <h3 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em]">
                  Scene Partner AI
                </h3>
              </div>

              <p className="text-muted-foreground mb-6">
                Rehearse your lines with an AI scene partner, anytime, anywhere.
              </p>

              {/* Features List */}
              <ul className="space-y-3 mb-6 flex-grow">
                <li className="flex items-start gap-2 text-sm">
                  <IconCheck size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span><strong>Practice with AI</strong> that reads opposite lines</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <IconCheck size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span><strong>Upload your own scripts</strong> for rehearsal</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <IconCheck size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span><strong>Rehearse anywhere</strong> without scheduling conflicts</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <IconCheck size={20} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span><strong>Perfect your timing</strong> and character choices</span>
                </li>
              </ul>

              {/* Video Placeholder */}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-8 mb-6 text-center">
                <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <IconMicrophone size={32} className="text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Demo video coming soon
                </p>
              </div>

              {/* CTA */}
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => setWaitlistOpen(true)}
              >
                Join Beta Waitlist
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Waitlist Modal */}
      <LandingWaitlistModal
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        feature="Scene Partner AI"
      />
    </>
  );
}
