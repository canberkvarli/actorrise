import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Women: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Find monologues for women from 8,600+ searchable pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and character type. Free to try.",
  openGraph: {
    title: "Monologues for Women | ActorRise",
    description:
      "Search 8,600+ monologues for women. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    url: `${siteUrl}/monologues-for-women`,
  },
  alternates: { canonical: `${siteUrl}/monologues-for-women` },
};

const SEARCH_QUERY = "monologue for woman";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Monologues for women
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Comedic, dramatic, classical, contemporary. Search monologues for women by tone, length, age
        range, or character type. Describe what you need in plain English, like &quot;fierce woman
        standing up for herself, under 2 minutes&quot; and get real matches from published plays.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search monologues for women
        </Link>
      </Button>
    </div>
  );
}
