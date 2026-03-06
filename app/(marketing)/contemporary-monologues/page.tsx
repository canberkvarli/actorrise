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

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          Also try{" "}
          <Link href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
            dramatic monologues
          </Link>
          ,{" "}
          <Link href="/monologues-for-men" className="text-foreground underline hover:no-underline">
            monologues for men
          </Link>
          , or{" "}
          <Link href="/shakespeare-monologues" className="text-foreground underline hover:no-underline">
            Shakespeare monologues
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-8">Frequently asked questions</h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              What counts as a contemporary monologue?
            </h3>
            <p className="text-muted-foreground">
              Generally anything written from the 1950s onward, though most people mean the last 20 to
              30 years. If the audition asks for &quot;contemporary,&quot; they usually want something
              modern that sounds like how people actually talk today.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Why do auditions ask for a contemporary monologue?
            </h3>
            <p className="text-muted-foreground">
              Casting wants to see how you handle realistic, everyday language. Contemporary pieces
              show your natural instincts without the added challenge of verse or heightened text.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Can I search by playwright or play title?
            </h3>
            <p className="text-muted-foreground">
              Yes. You can search by playwright name, play title, or describe the kind of piece you
              want. Try something like &quot;monologue from a play about siblings&quot; and the AI
              will find relevant matches.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
