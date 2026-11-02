import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Comedic Monologue for Woman Under 2 Minutes",
  description:
    "Find comedic monologues for women under 2 minutes from 19,000+ pieces. AI search by length, type, and style. Free to try.",
  openGraph: {
    title: "Comedic Monologue for Woman Under 2 Minutes | ActorRise",
    description:
      "Search 19,000+ monologues for comedic pieces for women under 2 minutes. AI-powered, natural language search.",
    url: `${siteUrl}/monologues/comedic-woman-under-2-minutes`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Comedic Monologue for Woman Under 2 Minutes | ActorRise",
    description:
      "Search 19,000+ monologues for comedic pieces for women under 2 minutes. AI-powered, natural language search.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/comedic-woman-under-2-minutes` },
};

const SEARCH_QUERY = "comedic monologue woman under 2 minutes";

export default function Page() {
  return (
    <StageHero
      direction={<T k="seoDirections.comedicWomanUnder2" />}
      title={
        <SeoT k="seoShelf.comedicWomanUnder2.title" slots={{ em: <em className="italic text-primary"><T k="seoShelf.comedicWomanUnder2.titleEm" /></em> }} />
      }
      lede={<T k="seoShelf.comedicWomanUnder2.lede" />}
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          <T k="seoCommon.search19k" />
        </Link>
      </Button>
    </StageHero>
  );
}
