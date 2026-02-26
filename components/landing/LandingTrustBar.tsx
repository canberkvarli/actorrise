"use client";

import { IconShieldCheck, IconStar } from "@tabler/icons-react";
import { LandingLiveCount } from "./LandingLiveCount";

/**
 * Trust bar with social proof badges displayed above the fold.
 * Shows Product Hunt badge, review rating, user count, and trust signals to build credibility immediately.
 */
export function LandingTrustBar() {
  return (
    <div className="border-y border-border/40 bg-muted/20 py-3 sm:py-4">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 md:gap-6 lg:gap-8 text-xs sm:text-sm">
          {/* Product Hunt Badge */}
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

          {/* Review Stars */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-yellow-500" aria-label="5 star rating">
              <IconStar size={16} fill="currentColor" />
              <IconStar size={16} fill="currentColor" />
              <IconStar size={16} fill="currentColor" />
              <IconStar size={16} fill="currentColor" />
              <IconStar size={16} fill="currentColor" />
            </div>
            <span className="text-muted-foreground whitespace-nowrap">
              <span className="font-medium text-foreground">4.9</span>/5 from actors
            </span>
          </div>

          {/* User Count - using existing LandingLiveCount */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <LandingLiveCount variant="inline" />
          </div>
        </div>
      </div>
    </div>
  );
}
