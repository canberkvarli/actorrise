import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Men: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Find monologues for men from 8,600+ searchable pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and character type. Free to try.",
  openGraph: {
    title: "Monologues for Men | ActorRise",
    description:
      "Search 8,600+ monologues for men. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    url: `${siteUrl}/monologues-for-men`,
  },
  alternates: { canonical: `${siteUrl}/monologues-for-men` },
};

const SEARCH_QUERY = "monologue for man";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Monologues for men
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Comedic, dramatic, classical, contemporary. Search monologues for men by tone, length, age
        range, or character type. Describe what you need in plain English, like &quot;conflicted
        father, serious tone, under 2 minutes&quot; and get real matches from published plays.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search monologues for men
        </Link>
      </Button>
    </div>
  );
}
