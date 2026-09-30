"use client";

/**
 * "Who's listing us" — the theatre-page equivalent of LandingPartners.
 *
 * Same data and the same rule (data/partners.ts, nothing renders below
 * `approved: true`), but restyled for the House. LandingPartners reads the
 * app's shadcn tokens (bg-background, text-foreground) and lives on the
 * Ghost Light landing page; .theatre carries its own palette and doesn't
 * read those tokens at all (see TheatreWalk's docstring), so this is a
 * separate small component rather than a shared one with a theme prop.
 *
 * Sits in HouseAct, after the founder note and before "what it costs" — the
 * same order LandingPartners describes: notices, then partners, then the
 * ticket. Renders nothing below PARTNERS_MIN_TO_SHOW, same as the app page.
 */

import {
  APPROVED_PARTNERS,
  PARTNERS_MIN_FOR_ROW,
  PARTNERS_MIN_TO_SHOW,
  type PartnerItem,
} from "@/data/partners";
import { trackPartnerClicked } from "@/lib/analytics";

/** "the Virginia Theatre Association" / "X and Y" / "X, Y and Z" */
function listPartnerNames(partners: PartnerItem[]): string {
  const names = partners.map((p) => p.name);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function PartnerMark({ partner, solo }: { partner: PartnerItem; solo: boolean }) {
  const height = solo ? "h-12 md:h-14" : "h-8 md:h-10";
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackPartnerClicked({ partner: partner.name, surface: "theatre-house" })}
      className="group inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition-opacity hover:opacity-100"
      style={{ opacity: solo ? 0.92 : 0.75 }}
    >
      {partner.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={partner.logo}
          alt={partner.name}
          loading="lazy"
          className={`${height} w-auto ${solo ? "max-w-[220px]" : "max-w-[150px]"} object-contain`}
        />
      ) : (
        <span
          className="text-sm md:text-base"
          style={{ fontFamily: "var(--t-display)", color: "var(--t-text)" }}
        >
          {partner.name}
        </span>
      )}
    </a>
  );
}

export function TheatrePartners() {
  if (APPROVED_PARTNERS.length < PARTNERS_MIN_TO_SHOW) return null;

  const asRow = APPROVED_PARTNERS.length >= PARTNERS_MIN_FOR_ROW;

  return (
    <div className="mt-[120px]">
      <p className="t-dir" style={{ color: "var(--t-muted-dark-2)" }}>
        (who&rsquo;s listing us.)
      </p>

      {asRow ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-9 gap-y-4">
          {APPROVED_PARTNERS.map((partner) => (
            <PartnerMark key={partner.url} partner={partner} solo={false} />
          ))}
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
          <div className="flex shrink-0 items-center gap-6">
            {APPROVED_PARTNERS.map((partner) => (
              <PartnerMark key={partner.url} partner={partner} solo />
            ))}
          </div>
          <span
            aria-hidden
            className="hidden h-9 w-px sm:block"
            style={{ background: "var(--t-line-light)" }}
          />
          <p
            className="m-0 text-[17px]"
            style={{ fontFamily: "var(--t-display)", color: "var(--t-text)" }}
          >
            Listed by the{" "}
            <em className="t-em" style={{ color: "var(--t-orange-deep)" }}>
              {listPartnerNames(APPROVED_PARTNERS)}
            </em>
            .
          </p>
        </div>
      )}
    </div>
  );
}
