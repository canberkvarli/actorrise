import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Comedic Monologue for Woman Under 2 Minutes",
  description:
    "Find comedic monologues for women under 2 minutes from 12,000+ pieces. AI search by length, type, and style. Free to try.",
  openGraph: {
    title: "Comedic Monologue for Woman Under 2 Minutes | ActorRise",
    description:
      "Search 12,000+ monologues for comedic pieces for women under 2 minutes. AI-powered, natural language search.",
    url: `${siteUrl}/monologues/comedic-woman-under-2-minutes`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Comedic Monologue for Woman Under 2 Minutes | ActorRise",
    description:
      "Search 12,000+ monologues for comedic pieces for women under 2 minutes. AI-powered, natural language search.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/comedic-woman-under-2-minutes` },
};

const SEARCH_QUERY = "comedic monologue woman under 2 minutes";

export default function Page() {
  return (
    <StageHero
      direction="(quick comedy.)"
      title={
        <>
          <em className="italic text-primary">Comedic</em> monologue for woman under 2 minutes
        </>
      }
      lede={
        <>
          One of the most common searches we see. ActorRise has thousands of comedic monologues for
          women, and you can filter by length, tone, and style. Or just describe what you need in
          plain English.
        </>
      }
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 12,000+ monologues
        </Link>
      </Button>
    </StageHero>
  );
}
