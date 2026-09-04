"use client";

/**
 * Logo row for organizations that list ActorRise. Quiet by design: it sits
 * between the testimonials and the pricing, so it stays a single line of marks
 * rather than a second card section. Logos: public/partners/. Data: data/partners.ts.
 */

import {
  APPROVED_PARTNERS,
  PARTNERS_MIN_TO_SHOW,
  type PartnerItem,
} from "@/data/partners";
import Link from "next/link";
import { motion } from "framer-motion";

const EASE = [0.25, 0.1, 0.25, 1] as const;

/** Height cap for both real logos and the wordmark fallback, so the row stays on one baseline. */
const MARK_HEIGHT = "h-8 md:h-10";

function PartnerMark({ partner }: { partner: PartnerItem }) {
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex flex-col items-center gap-1.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {partner.logo ? (
        // Plain <img>: logos arrive at arbitrary aspect ratios and are capped by height
        // with width flowing, which next/image's width+height contract fights.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={partner.logo}
          alt={partner.name}
          loading="lazy"
          className={`${MARK_HEIGHT} w-auto max-w-[150px] object-contain grayscale opacity-70 transition duration-300 ease-out group-hover:grayscale-0 group-hover:opacity-100`}
        />
      ) : (
        <span
          className={`${MARK_HEIGHT} flex items-center font-serif text-sm md:text-base text-center text-muted-foreground transition-colors duration-300 group-hover:text-foreground`}
        >
          {partner.name}
        </span>
      )}
      {partner.shortName && (
        // aria-hidden: the alt text / wordmark above already names the partner.
        <span
          aria-hidden
          className="text-[11px] uppercase tracking-wide text-muted-foreground/70 transition-colors group-hover:text-muted-foreground"
        >
          {partner.shortName}
        </span>
      )}
    </a>
  );
}

export function LandingPartners() {
  // Fewer than a handful of marks reads as thin rather than trusted, so show none.
  if (APPROVED_PARTNERS.length < PARTNERS_MIN_TO_SHOW) return null;

  return (
    <section
      className="relative border-t border-border/60 py-14 md:py-16 bg-background overflow-hidden"
      aria-label="Where you'll find us"
    >
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-2 text-center md:flex-row md:items-baseline md:justify-between md:text-left">
            <motion.p
              className="font-brand text-xl sm:text-2xl md:text-3xl tracking-tight font-semibold text-foreground"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              Where you&rsquo;ll find us
            </motion.p>
            <Link
              href="/partners"
              className="text-sm text-primary hover:underline font-medium shrink-0"
            >
              See all &rarr;
            </Link>
          </div>

          <motion.div
            // items-start so the capped mark boxes share a top edge; an optional
            // shortName label then hangs below without lifting its logo off the line.
            className="mt-8 flex flex-wrap items-start justify-center gap-x-6 gap-y-4 sm:gap-x-10 md:justify-start"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
          >
            {APPROVED_PARTNERS.map((partner) => (
              <PartnerMark key={partner.url} partner={partner} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
