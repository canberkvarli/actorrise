import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Shakespeare Monologues for Auditions",
  description:
    "Find Shakespeare monologues for auditions from Hamlet, Macbeth, A Midsummer Night's Dream, and more. 7,500+ searchable pieces with AI. Filter by play, length, and character type.",
  openGraph: {
    title: "Shakespeare Monologues for Auditions | ActorRise",
    description:
      "Search Shakespeare monologues by character, play, tone, and length. AI-powered discovery from 7,500+ pieces.",
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

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          Also browse{" "}
          <Link href="/monologues/classical-monologues" className="text-foreground underline hover:no-underline">
            classical monologues
          </Link>
          ,{" "}
          <Link href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
            dramatic monologues
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
              What Shakespeare monologues are good for auditions?
            </h3>
            <p className="text-muted-foreground">
              It depends on the role. For drama, Hamlet, Macbeth, and Othello have strong options. For
              comedy, try Twelfth Night, A Midsummer Night&apos;s Dream, or Much Ado About Nothing.
              The best audition monologue is one that fits the tone of the show you&apos;re auditioning
              for. Use the search to filter by tone and character type.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              How long should a Shakespeare monologue be for an audition?
            </h3>
            <p className="text-muted-foreground">
              Most auditions ask for 1 to 2 minutes. That&apos;s roughly 15 to 25 lines of verse.
              If the listing doesn&apos;t specify, aim for under 90 seconds. You can filter by length
              in the search.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Does ActorRise have the full text of Shakespeare monologues?
            </h3>
            <p className="text-muted-foreground">
              Yes. Shakespeare&apos;s works are in the public domain, so we include full monologue
              text you can read, save, and rehearse with{" "}
              <Link href="/scene-partner-ai" className="text-foreground underline hover:no-underline">
                ScenePartner AI
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
