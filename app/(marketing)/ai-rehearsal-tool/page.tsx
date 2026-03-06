import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "AI Rehearsal Tool for Actors: Practice Scenes & Monologues",
  description:
    "AI rehearsal tool that reads the other lines so you can practice scenes and monologues before auditions. 8,600+ monologues, 14,000+ film & TV scenes. Free to try.",
  openGraph: {
    title: "AI Rehearsal Tool for Actors | ActorRise",
    description:
      "Practice scenes and monologues with AI that reads the other lines. 8,600+ monologues, 14,000+ scenes. Free to try.",
    url: `${siteUrl}/ai-rehearsal-tool`,
  },
  alternates: { canonical: `${siteUrl}/ai-rehearsal-tool` },
};

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        AI rehearsal tool for actors
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Find your material and rehearse it in one place. ActorRise combines AI monologue search with
        ScenePartner, a rehearsal tool that reads the other lines out loud so you can practice scenes
        and monologues on your own schedule.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">Find material</strong>: search 8,600+ monologues and
            14,000+ film & TV scene references by meaning, not keywords.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">Rehearse scenes</strong>: ScenePartner reads the
            other lines, listens for your cues, and keeps the scene moving.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">Audition prep</strong>: Overdone filter, fit-to-type
            matching, and side-running so you walk in ready.
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/scene-partner-ai">Learn about ScenePartner</Link>
        </Button>
      </div>

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          Looking for material? Try the{" "}
          <Link href="/monologue-finder" className="text-foreground underline hover:no-underline">
            monologue finder
          </Link>
          , browse{" "}
          <Link href="/audition-monologues" className="text-foreground underline hover:no-underline">
            audition monologues
          </Link>
          , or explore{" "}
          <Link href="/monologues-for-women" className="text-foreground underline hover:no-underline">
            monologues for women
          </Link>{" "}
          and{" "}
          <Link href="/monologues-for-men" className="text-foreground underline hover:no-underline">
            monologues for men
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-8">Frequently asked questions</h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              Is ActorRise free to use?
            </h3>
            <p className="text-muted-foreground">
              Yes. The free tier gives you access to monologue search and limited ScenePartner
              sessions. No credit card required. Check the{" "}
              <Link href="/pricing" className="text-foreground underline hover:no-underline">
                pricing page
              </Link>{" "}
              for details on paid plans.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              How is this different from rehearsing with a friend?
            </h3>
            <p className="text-muted-foreground">
              It&apos;s available whenever you need it. No scheduling, no asking for favors.
              ScenePartner reads the lines consistently every time, which is great for drilling
              memorization and working on your choices before you bring it to a real scene partner.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              What kind of material can I rehearse?
            </h3>
            <p className="text-muted-foreground">
              Anything. Monologues and scenes from the 8,600+ piece database, your own sides or
              scripts that you paste in, or film and TV scene references from the 14,000+ reference
              library.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
