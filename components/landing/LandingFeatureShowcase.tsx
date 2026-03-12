"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconCheck } from "@tabler/icons-react";

export function LandingFeatureShowcase() {
  return (
    <section className="container mx-auto px-4 sm:px-6 py-16 sm:py-20 md:py-28 border-t border-border/60">
      <div className="max-w-6xl mx-auto">

        {/* Section Header */}
        <div className="mb-10 sm:mb-14 md:mb-18">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 mb-4">
            <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
            New
          </span>
          <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-serif tracking-[-0.03em] leading-[1.05]">
            ScenePartner is live.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-md">
            Find the right piece. Rehearse it until it's yours.
          </p>
        </div>

        {/* Two-Feature Grid */}
        <div className="grid md:grid-cols-2 gap-5 sm:gap-6">

          {/* Monologue Search */}
          <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col group hover:border-primary/40 transition-colors duration-300">
            <div className="flex items-start justify-between mb-6">
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/60">
                Step 01
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-serif tracking-[-0.02em] mb-2">
              Find your piece.
            </h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              8,600+ monologues and 14,000+ Film & TV scenes. Filter out the overdone ones. Search in plain English.
            </p>

            <ul className="space-y-2.5 mb-8 flex-grow">
              {[
                "Overdone filter. Stop bringing what everyone brings.",
                "Classical to contemporary, stage to screen",
                "Natural language search. Describe what you need.",
                "Bookmark and build your shortlist",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <IconCheck size={15} className="text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Button asChild size="lg" className="w-full">
              <Link href="/search">Find a piece</Link>
            </Button>
          </div>

          {/* Scene Partner AI */}
          <div className="relative rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col group hover:border-primary/40 transition-colors duration-300">
            <div className="flex items-start justify-between mb-6">
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/60">
                Step 02
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-serif tracking-[-0.02em] mb-2">
              Rehearse it cold.
            </h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              An AI scene partner that knows every line, never cancels, and is ready at 2am the night before.
            </p>

            <ul className="space-y-2.5 mb-8 flex-grow">
              {[
                "AI reads opposite lines. You stay in the scene.",
                "Upload your own script, extract scenes instantly",
                "Voice-to-voice rehearsal, no typing",
                "Run it again until it's in your DNA.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <IconCheck size={15} className="text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <Button asChild size="lg" className="w-full">
              <Link href="/my-scripts">Start rehearsing</Link>
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}
