import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { StageHero } from "@/components/marketing/StageHero";
import {
  APPROVED_PARTNERS,
  PARTNER_CATEGORY_LABELS,
  PARTNER_CATEGORY_ORDER,
  type PartnerItem,
} from "@/data/partners";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "With thanks",
  description:
    "The theatre chapters, companies, studios, schools and newsletters that list ActorRise for their actors.",
  openGraph: {
    title: "With thanks | ActorRise",
    description:
      "The theatre chapters, companies, studios, schools and newsletters that list ActorRise for their actors.",
    url: `${siteUrl}/thanks`,
  },
  twitter: {
    card: "summary_large_image",
    title: "With thanks | ActorRise",
    description:
      "The theatre chapters, companies, studios, schools and newsletters that list ActorRise for their actors.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/thanks` },
};

/** Known categories in their listed order, then anything unrecognised, alphabetically. */
function orderedCategories(partners: PartnerItem[]): string[] {
  const known = PARTNER_CATEGORY_ORDER as readonly string[];
  const present = Array.from(new Set(partners.map((p) => p.category)));
  return present.sort((a, b) => {
    const ai = known.indexOf(a);
    const bi = known.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function PartnerCard({ partner }: { partner: PartnerItem }) {
  return (
    <a
      href={partner.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {/* No logo and no short label: the slot collapses rather than repeating the name,
          which already sits beside it. */}
      {(partner.logo || partner.shortName) && (
        <span className="flex w-20 shrink-0 items-center justify-center sm:w-24">
          {partner.logo ? (
            // Plain <img>: partner logos come at arbitrary aspect ratios and are capped
            // by height with width flowing, which next/image's width+height contract fights.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partner.logo}
              alt={partner.name}
              loading="lazy"
              className="max-h-12 w-auto max-w-full object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="text-xs uppercase tracking-wide text-center text-muted-foreground"
            >
              {partner.shortName}
            </span>
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{partner.name}</span>
        {partner.blurb && (
          <span className="mt-0.5 block text-sm text-muted-foreground">{partner.blurb}</span>
        )}
      </span>

      <ArrowUpRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
      />
    </a>
  );
}

export default function ThanksPage() {
  const partners = APPROVED_PARTNERS;
  const categories = orderedCategories(partners);

  return (
    <>
      <StageHero
        direction="(in the programme.)"
        title={
          <>
            Where you&rsquo;ll <em className="italic text-primary">find us</em>.
          </>
        }
        lede={
          <>
            Theatre chapters, companies, studios, schools and newsletters that point their actors
            at ActorRise. If you run one and want a listing, write to me.
          </>
        }
      />

      <div className="container mx-auto max-w-3xl px-6 py-12 md:py-16">
        {partners.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing listed here yet. If your organization has ActorRise in a resource guide or
            newsletter, email{" "}
            <a
              href="mailto:canberk@actorrise.com"
              className="text-primary underline hover:no-underline"
            >
              canberk@actorrise.com
            </a>{" "}
            and I will add you.
          </p>
        ) : (
          categories.map((category) => (
            <section key={category} className="mb-10 last:mb-0">
              <h2 className="mb-4 text-xl font-semibold text-foreground">
                {PARTNER_CATEGORY_LABELS[category] || category}
              </h2>
              <div className="grid gap-3">
                {partners
                  .filter((p) => p.category === category)
                  .map((partner) => (
                    <PartnerCard key={partner.url} partner={partner} />
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  );
}
