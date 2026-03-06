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

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          Looking for something specific? Try{" "}
          <Link href="/shakespeare-monologues" className="text-foreground underline hover:no-underline">
            Shakespeare monologues
          </Link>
          ,{" "}
          <Link href="/contemporary-monologues" className="text-foreground underline hover:no-underline">
            contemporary monologues
          </Link>
          , or{" "}
          <Link href="/monologues-for-women" className="text-foreground underline hover:no-underline">
            monologues for women
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-8">Frequently asked questions</h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              What makes a good dramatic monologue for an audition?
            </h3>
            <p className="text-muted-foreground">
              A good dramatic monologue has clear stakes, a shift in emotion, and something for you to
              play. Avoid pieces that are just sad from start to finish. Look for a monologue where the
              character wants something and is actively trying to get it.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              How do I find a dramatic monologue that isn&apos;t overdone?
            </h3>
            <p className="text-muted-foreground">
              ActorRise has an Overdone filter that flags monologues casting directors see constantly.
              Search for what you need, then toggle the filter to surface fresh material that still
              fits the tone.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Can I rehearse my dramatic monologue on ActorRise?
            </h3>
            <p className="text-muted-foreground">
              Yes.{" "}
              <Link href="/scene-partner-ai" className="text-foreground underline hover:no-underline">
                ScenePartner AI
              </Link>{" "}
              lets you rehearse scenes and monologues with AI reading the other lines. Save any
              monologue and practice it directly in the app.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
