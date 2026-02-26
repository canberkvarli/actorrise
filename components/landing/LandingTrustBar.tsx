"use client";

import { IconStar } from "@tabler/icons-react";
import { LandingLiveCount } from "./LandingLiveCount";

/**
 * Compact social proof shown directly under the hero CTA.
 * Star rating only — keeps the CTA area clean.
 */
export function HeroProofBar() {
  return (
    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
      <div className="flex items-center gap-0.5 text-yellow-500" aria-label="4.9 out of 5 star rating">
        <IconStar size={14} fill="currentColor" />
        <IconStar size={14} fill="currentColor" />
        <IconStar size={14} fill="currentColor" />
        <IconStar size={14} fill="currentColor" />
        <IconStar size={14} fill="currentColor" />
      </div>
      <span>
        <span className="font-medium text-foreground">4.9</span>/5 from actors
      </span>
    </div>
  );
}

/**
 * Trust bar strip showing the Product Hunt badge + live search counter.
 */
export function LandingTrustBar() {
  return (
    <div className="border-y border-border/40 bg-muted/20 py-3 sm:py-4">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
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
              className="h-[54px] w-auto"
            />
          </a>

          <LandingLiveCount variant="inline" />
        </div>
      </div>
    </div>
  );
}
