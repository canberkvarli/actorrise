import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Contemporary Monologues for Auditions",
  description:
    "Find contemporary monologues for auditions from 8,600+ searchable pieces. Modern plays, current voices. AI search by tone, length, and character type. Free to try.",
  openGraph: {
    title: "Contemporary Monologues for Auditions | ActorRise",
    description:
      "Search 8,600+ monologues for contemporary pieces from modern plays. AI-powered discovery.",
    url: `${siteUrl}/contemporary-monologues`,
  },
  alternates: { canonical: `${siteUrl}/contemporary-monologues` },
};

const SEARCH_QUERY = "contemporary monologue modern play";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Contemporary monologues for auditions
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Modern plays, current voices, pieces that feel alive. Search contemporary monologues by tone,
        character type, or theme. The AI understands what you mean, so &quot;funny monologue from a
        recent play about family&quot; actually works.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search contemporary monologues
        </Link>
      </Button>
    </div>
  );
}
