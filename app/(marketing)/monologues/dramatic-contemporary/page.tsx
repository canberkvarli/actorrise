import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologue from Contemporary Play",
  description:
    "Find dramatic monologues from contemporary plays in 7,500+ searchable pieces. AI search by era, tone, and length. Free to try.",
  openGraph: {
    title: "Dramatic Monologue from Contemporary Play | ActorRise",
    description:
      "Search 7,500+ monologues for dramatic pieces from contemporary plays. AI-powered discovery.",
    url: `${siteUrl}/monologues/dramatic-contemporary`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatic Monologue from Contemporary Play | ActorRise",
    description:
      "Search 7,500+ monologues for dramatic pieces from contemporary plays. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/dramatic-contemporary` },
};

const SEARCH_QUERY = "dramatic monologue contemporary play";

export default function Page() {
  return (
    <StageHero
      direction="(modern drama.)"
      title={
        <>
          Dramatic monologue from a <em className="italic text-primary">contemporary</em> play
        </>
      }
      lede={
        <>
          Looking for something serious, modern, and not overdone? We have thousands of dramatic
          monologues from contemporary plays. Search by emotion, relationship, or length. No keyword
          guessing.
        </>
      }
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 7,500+ monologues
        </Link>
      </Button>
    </StageHero>
  );
}
