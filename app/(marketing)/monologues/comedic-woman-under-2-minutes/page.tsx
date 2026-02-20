import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Comedic Monologue for Woman Under 2 Minutes",
  description:
    "Find comedic monologues for women under 2 minutes from 8,600+ pieces. AI search by length, type, and style. Free to try.",
  openGraph: {
    title: "Comedic Monologue for Woman Under 2 Minutes | ActorRise",
    description:
      "Search 8,600+ monologues for comedic pieces for women under 2 minutes. AI-powered, natural language search.",
    url: `${siteUrl}/monologues/comedic-woman-under-2-minutes`,
  },
  alternates: { canonical: `${siteUrl}/monologues/comedic-woman-under-2-minutes` },
};

const SEARCH_QUERY = "comedic monologue woman under 2 minutes";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Comedic monologue for woman under 2 minutes
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        One of the most common searches we see. ActorRise has thousands of comedic monologues for
        women, and you can filter by length, tone, and style. Or just describe what you need in
        plain English.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 8,600+ monologues
        </Link>
      </Button>
    </div>
  );
}
