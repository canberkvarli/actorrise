"use client";

/**
 * Logo row for organizations that list ActorRise. Quiet by design: it sits
 * between the testimonials and the pricing, so it stays a single line of marks
 * rather than a second card section. Logos: public/partners/. Data: data/partners.ts.
 */

import {
  APPROVED_PARTNERS,
  PARTNERS_MIN_FOR_ROW,
  PARTNERS_MIN_TO_SHOW,
  type PartnerItem,
} from "@/data/partners";
import { trackPartnerClicked } from "@/lib/analytics";
import Link from "next/link";
import { motion } from "framer-motion";

const EASE = [0.25, 0.1, 0.25, 1] as const;

/** Height cap for both real logos and the wordmark fallback, so a row stays on one baseline. */
const MARK_HEIGHT = "h-8 md:h-10";

/** A lone mark is the evidence for the sentence beside it, so it is set larger than a row cap. */
const SOLO_MARK_HEIGHT = "h-11 md:h-14";

/** One heading treatment for both layouts, so the switch at the threshold is invisible. */
const HEADING_CLASS =
  "font-brand text-xl sm:text-2xl md:text-3xl tracking-tight font-semibold text-foreground";

function SeeAllLink({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <Link
      href="/thanks"
      className={`text-sm text-primary hover:underline underline-offset-4 font-medium shrink-0 ${className}`}
    >
      {label} &rarr;
    </Link>
  );
}

/** "the Virginia Theatre Association" / "X and Y" / "X, Y and Z" — reads in a sentence. */
function listPartnerNames(partners: PartnerItem[]): string {
  const names = partners.map((p) => p.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function PartnerMark({
  partner,
  // In the sentence layout the heading already names the organization, so the
  // short label under the mark would say it twice.
  showLabel,
  solo = false,
}: {
  partner: PartnerItem;
  showLabel: boolean;
  /** Sole mark in the section: larger, and at full strength rather than dimmed. */
  solo?: boolean;
}) {
  const height = solo ? SOLO_MARK_HEIGHT : MARK_HEIGHT;
  // A wall of marks is quieted so no single logo shouts; one mark standing as the
  // credential is not competing with anything, so it is shown nearly at strength.
  const rest = solo ? "opacity-90" : "grayscale opacity-70";
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackPartnerClicked({ partner: partner.name, surface: "landing" })}
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
          // dark:invert: the marks arrive as black on transparent, which disappears
          // entirely against the dark shell. Inverting reads them as white there.
          // A fullColor mark already reads on dark, so it is left alone.
          className={`${height} w-auto ${solo ? "max-w-[200px]" : "max-w-[150px]"} object-contain ${rest} transition duration-300 ease-out ${partner.fullColor ? "" : "dark:invert"} group-hover:grayscale-0 group-hover:opacity-100`}
        />
      ) : (
        <span
          className={`${height} flex items-center font-serif text-sm md:text-base text-center text-muted-foreground transition-colors duration-300 group-hover:text-foreground`}
        >
          {partner.name}
        </span>
      )}
      {showLabel && partner.shortName && (
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
  if (APPROVED_PARTNERS.length < PARTNERS_MIN_TO_SHOW) return null;

  // Below a handful, a wrapped logo row reads as thin rather than trusted. So the
  // few-partner case is written as a sentence naming them, with the marks beside
  // it: the same fact, stated instead of gridded. The row takes over at the
  // threshold without any further change here.
  const asRow = APPROVED_PARTNERS.length >= PARTNERS_MIN_FOR_ROW;

  return (
    <section
      className={`relative border-t border-border/60 bg-background overflow-hidden ${
        asRow ? "py-14 md:py-16" : "py-12 md:py-14"
      }`}
      aria-label="Where you'll find us"
    >
      <div className="container relative mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          {asRow ? (
            <>
              <div className="flex flex-col gap-2 text-center md:flex-row md:items-baseline md:justify-between md:text-left">
                <motion.p
                  className={HEADING_CLASS}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  Where you&rsquo;ll find us
                </motion.p>
                <SeeAllLink label="See all" />
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
                  <PartnerMark key={partner.url} partner={partner} showLabel />
                ))}
              </motion.div>
            </>
          ) : (
            <motion.div
              // One line, mark first: the seal, then the sentence it proves, then
              // the way in. -my-2 keeps the anchor's own padding from making the
              // strip taller than the line of type it sits on.
              className="-my-2 flex flex-col items-center gap-y-4 text-center md:flex-row md:items-center md:gap-x-7 md:text-left"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <div className="flex shrink-0 items-center gap-x-7">
                {APPROVED_PARTNERS.map((partner) => (
                  <PartnerMark
                    key={partner.url}
                    partner={partner}
                    showLabel={false}
                    solo
                  />
                ))}
                {/* Hairline rule: separates the mark from the claim without boxing either. */}
                <span
                  aria-hidden
                  className="hidden h-10 w-px bg-border md:block"
                />
              </div>

              <p className={`${HEADING_CLASS} text-balance`}>
                Listed by the{" "}
                <span className="text-primary">
                  {listPartnerNames(APPROVED_PARTNERS)}
                </span>
                .
              </p>

              {/* "See all" would promise a list; this names the page it opens. */}
              <SeeAllLink label="With thanks" className="md:ml-auto md:self-center" />
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
