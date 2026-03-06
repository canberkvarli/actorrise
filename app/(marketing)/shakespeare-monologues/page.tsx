import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Shakespeare Monologues for Auditions",
  description:
    "Find Shakespeare monologues for auditions from Hamlet, Macbeth, A Midsummer Night's Dream, and more. 8,600+ searchable pieces with AI. Filter by play, length, and character type.",
  openGraph: {
    title: "Shakespeare Monologues for Auditions | ActorRise",
    description:
      "Search Shakespeare monologues by character, play, tone, and length. AI-powered discovery from 8,600+ pieces.",
    url: `${siteUrl}/shakespeare-monologues`,
  },
  alternates: { canonical: `${siteUrl}/shakespeare-monologues` },
};

const SEARCH_QUERY = "Shakespeare monologue for audition";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Shakespeare monologues for auditions
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Hamlet, Macbeth, Twelfth Night, A Midsummer Night&apos;s Dream, and dozens more. Search
        Shakespeare monologues by character, tone, or length. The AI understands what you need, so
        you can search like &quot;angry speech from a king&quot; or &quot;comedic woman from a
        Shakespeare comedy&quot; and get real matches.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search Shakespeare monologues
        </Link>
      </Button>
    </div>
  );
}
