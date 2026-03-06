import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologues for Auditions",
  description:
    "Find dramatic monologues for auditions from 8,600+ searchable pieces. Serious, emotional, high-stakes. AI search by tone, length, and character type. Free to try.",
  openGraph: {
    title: "Dramatic Monologues for Auditions | ActorRise",
    description:
      "Search 8,600+ monologues for dramatic, emotional pieces. AI-powered discovery by tone, length, and character.",
    url: `${siteUrl}/dramatic-monologues`,
  },
  alternates: { canonical: `${siteUrl}/dramatic-monologues` },
};

const SEARCH_QUERY = "dramatic monologue for audition";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Dramatic monologues for auditions
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Serious, emotional, high-stakes. Search dramatic monologues by tone, era, or character type.
        Whether you need something gut-wrenching or quietly intense, the AI matches you to real
        pieces from published plays. No keyword guessing.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search dramatic monologues
        </Link>
      </Button>
    </div>
  );
}
