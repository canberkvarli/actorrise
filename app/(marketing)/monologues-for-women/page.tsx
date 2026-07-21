import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Women: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Find monologues for women from 12,000+ searchable pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and character type. Free to try.",
  openGraph: {
    title: "Monologues for Women | ActorRise",
    description:
      "Search 12,000+ monologues for women. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    url: `${siteUrl}/monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Women | ActorRise",
    description:
      "Search 12,000+ monologues for women. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues-for-women` },
};

const SEARCH_QUERY = "monologue for woman";

export default function Page() {
  return (
    <>
      <StageHero
        direction="(the women's roles.)"
        title={
          <>
            Monologues for <em className="italic text-primary">women</em>.
          </>
        }
        lede={
          <>
            Comedic, dramatic, classical, contemporary. Search monologues for women by tone, length, age
            range, or character type. Describe what you need in plain English, like &quot;fierce woman
            standing up for herself, under 2 minutes&quot; and get real matches from published plays.
          </>
        }
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            Search monologues for women
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          Browse by category:{" "}
          <Link href="/monologues/comedic-woman-under-2-minutes" className="text-foreground underline hover:no-underline">
            comedic monologues for women under 2 minutes
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
              How do I pick the right monologue for an audition?
            </h3>
            <p className="text-muted-foreground">
              Match the tone of the show. If you&apos;re auditioning for a comedy, bring a comedic
              piece. If the breakdown mentions a specific age range or type, search for that. The
              Overdone filter helps you avoid pieces casting directors have heard a thousand times.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Can I filter monologues by age range?
            </h3>
            <p className="text-muted-foreground">
              Yes. Describe the age range in your search, like &quot;monologue for woman in her
              20s&quot; or &quot;older woman, 50s, serious.&quot; The AI understands natural language
              so you don&apos;t need to pick from dropdown menus.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Can I rehearse monologues on ActorRise?
            </h3>
            <p className="text-muted-foreground">
              Yes. Save any monologue and rehearse it with{" "}
              <Link href="/scene-partner-ai" className="text-foreground underline hover:no-underline">
                ScenePartner AI
              </Link>
              , which reads the other lines out loud so you can practice on your own.
            </p>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
