"use client";

import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { UploadScriptButton } from "@/components/practice/UploadScriptButton";
import type { UserScript } from "@/hooks/useScripts";

interface PracticeHeadlineCardProps {
  /** Most recently uploaded user script (excludes demo). Null when the user has none. */
  featuredScript: UserScript | null;
  /** ID of the system sample (`is_sample=true`) so the empty-state can link to it. */
  demoScriptId: number | null;
}

/**
 * Hero card: the ONE thing to do right now.
 *
 * - No featured script: "Start where it matters." with two CTAs.
 * - Featured script:    "Where you left off." with the script as a clickable lead.
 *
 * NOTE: When recent-rehearsal data ships, swap `featuredScript` for the most
 * recently practiced scene.
 */
export function PracticeHeadlineCard({
  featuredScript,
  demoScriptId,
}: PracticeHeadlineCardProps) {
  const hasFeatured = featuredScript !== null;

  return (
    <section
      className={[
        "relative overflow-hidden",
        "border border-border/60",
        "bg-card/40 dark:bg-[#CB4B00]/[0.04]",
        "px-5 py-8 sm:px-8 sm:py-12 md:px-10 md:py-14",
        "transition-colors",
      ].join(" ")}
    >
      {/* Soft warm glow accent (dark mode only) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#CB4B00]/0 dark:bg-[#CB4B00]/[0.06] blur-3xl"
      />

      {hasFeatured ? (
        <FeaturedScriptHero script={featuredScript!} />
      ) : (
        <EmptyStateHero demoScriptId={demoScriptId} />
      )}
    </section>
  );
}

function EmptyStateHero({ demoScriptId }: { demoScriptId: number | null }) {
  return (
    <div className="relative space-y-6 max-w-2xl">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Begin
        </p>
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground leading-[1.1]">
          Start where it matters.
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed max-w-lg">
          Upload a script and rehearse with an AI partner reading every other role. Or open the demo and see how a scene comes alive.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center pt-2">
        <UploadScriptButton variant="primary">
          Upload a script
        </UploadScriptButton>

        {demoScriptId != null && (
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="gap-1.5 h-11 px-3 font-medium text-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Link href={`/practice/${demoScriptId}`}>
              Open the demo
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function FeaturedScriptHero({ script }: { script: UserScript }) {
  const charactersSummary =
    script.processing_status === "completed" && script.num_characters > 0
      ? `${script.num_characters} character${script.num_characters !== 1 ? "s" : ""}`
      : null;
  const scenesSummary =
    script.processing_status === "completed" && script.num_scenes_extracted > 0
      ? `${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`
      : null;
  const metaParts = [script.author, charactersSummary, scenesSummary].filter(
    (s): s is string => Boolean(s),
  );

  return (
    <div className="relative space-y-6 max-w-3xl">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Recent
        </p>
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight text-foreground leading-[1.1]">
          Where you left off.
        </h2>
        <p className="text-base text-muted-foreground leading-relaxed max-w-lg">
          Your most recent script. One click and the partner is reading with you.
        </p>
      </div>

      <Link
        href={`/practice/${script.id}`}
        className={[
          "group block rounded-lg",
          "border border-border/70 bg-background/60",
          "px-4 py-4 sm:px-6 sm:py-6",
          "transition-all duration-200",
          "hover:border-border hover:shadow-md",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-4 sm:gap-6">
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3 className="font-serif text-lg sm:text-2xl tracking-tight text-foreground truncate">
              {script.title}
            </h3>
            {metaParts.length > 0 && (
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {metaParts.join(" · ")}
              </p>
            )}
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-[#CB4B00] group-hover:text-[#B03000] transition-colors whitespace-nowrap">
            Open script
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
        <span className="sm:hidden mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#CB4B00] group-hover:text-[#B03000] transition-colors">
          Open script
          <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </div>
  );
}

export default PracticeHeadlineCard;
