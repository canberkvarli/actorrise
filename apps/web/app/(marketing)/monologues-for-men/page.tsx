import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Men: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Find monologues for men from 7,500+ searchable pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and character type. Free to try.",
  openGraph: {
    title: "Monologues for Men | ActorRise",
    description:
      "Search 7,500+ monologues for men. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
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

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          Browse by category:{" "}
          <Link href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
            dramatic monologues
          </Link>
          ,{" "}
          <Link href="/shakespeare-monologues" className="text-foreground underline hover:no-underline">
            Shakespeare monologues
          </Link>
          , or{" "}
          <Link href="/contemporary-monologues" className="text-foreground underline hover:no-underline">
            contemporary monologues
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-8">Frequently asked questions</h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              What are good monologues for men that aren&apos;t overdone?
            </h3>
            <p className="text-muted-foreground">
              The Overdone filter on ActorRise flags pieces that casting directors see constantly.
              Search for what you need, toggle the filter, and you&apos;ll get fresh material that
              still fits the tone of your audition.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Should I do a comedic or dramatic monologue?
            </h3>
            <p className="text-muted-foreground">
              Match the tone of the project. If the audition doesn&apos;t specify, go with whichever
              shows your range better. Some actors keep one of each ready. You can search for both
              and save them to your library.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Can I practice my monologue with AI?
            </h3>
            <p className="text-muted-foreground">
              Yes.{" "}
              <Link href="/ai-rehearsal-tool" className="text-foreground underline hover:no-underline">
                ActorRise&apos;s rehearsal tool
              </Link>{" "}
              lets you run through scenes and monologues with AI reading the other parts. No need to
              find a scene partner.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
