import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologue from Contemporary Play",
  description:
    "Find dramatic monologues from contemporary plays in 19,000+ searchable pieces. AI search by era, tone, and length. Free to try.",
  openGraph: {
    title: "Dramatic Monologue from Contemporary Play | ActorRise",
    description:
      "Search 19,000+ monologues for dramatic pieces from contemporary plays. AI-powered discovery.",
    url: `${siteUrl}/monologues/dramatic-contemporary`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatic Monologue from Contemporary Play | ActorRise",
    description:
      "Search 19,000+ monologues for dramatic pieces from contemporary plays. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/dramatic-contemporary` },
};

const SEARCH_QUERY = "dramatic monologue contemporary play";

export default function Page() {
  return (
    <StageHero
      direction={<T k="seoDirections.dramaticContemporary" />}
      title={
        <SeoT k="seoShelf.dramaticContemporary.title" slots={{ em: <em className="italic text-primary"><T k="seoShelf.dramaticContemporary.titleEm" /></em> }} />
      }
      lede={<T k="seoShelf.dramaticContemporary.lede" />}
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          <T k="seoCommon.search19k" />
        </Link>
      </Button>
    </StageHero>
  );
}
