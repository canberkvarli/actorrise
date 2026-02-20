import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologue Finder for Actors | Find Audition Pieces Fast | ActorRise",
  description:
    "Use ActorRise's monologue finder to search 8,600+ real monologues by tone, length, and character type. No keyword guessing. Free to start.",
  openGraph: {
    title: "Monologue Finder for Actors | ActorRise",
    description:
      "Find your next audition piece in seconds. 8,600+ monologues, AI search, no keyword hunting. Free tier available.",
    url: `${siteUrl}/monologue-finder`,
  },
  alternates: { canonical: `${siteUrl}/monologue-finder` },
};

export default function MonologueFinderPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Monologue finder: find your next audition piece in seconds
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        ActorRise is a monologue finder and database built for actors. Search 8,600+ real monologues
        by describing what you need in plain English, no keyword hunting. Get a shortlist in under 20
        seconds.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>One of the largest searchable monologue databases online</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>AI search that understands “comedic woman under 2 minutes” or “angry contemporary male”</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Real scripts from playwrights, not AI-generated text</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so you can bring something fresh to the room</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        Free tier available. No credit card required to try.{" "}
        <Link href="/" className="text-foreground font-medium underline hover:no-underline">
          Try the search on the homepage
        </Link>{" "}
        or sign up to save bookmarks and use the full database.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the monologue finder</Link>
        </Button>
      </div>
    </div>
  );
}
