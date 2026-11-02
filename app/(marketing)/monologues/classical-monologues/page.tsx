import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Classical Monologues for Auditions",
  description:
    "Find classical monologues from Shakespeare and beyond. 19,000+ searchable pieces with AI. Filter by play, length, and character type.",
  openGraph: {
    title: "Classical Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for classical pieces. Shakespeare and more. AI-powered discovery.",
    url: `${siteUrl}/monologues/classical-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Classical Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for classical pieces. Shakespeare and more. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/classical-monologues` },
};

const SEARCH_QUERY = "classical monologue Shakespeare";

export default function Page() {
  return (
    <StageHero
      direction={<T k="seoDirections.classical" />}
      title={
        <SeoT k="seoShelf.classical.title" slots={{ em: <em className="italic text-primary"><T k="seoShelf.classical.titleEm" /></em> }} />
      }
      lede={<T k="seoShelf.classical.lede" />}
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          <T k="seoCommon.search19k" />
        </Link>
      </Button>
    </StageHero>
  );
}
