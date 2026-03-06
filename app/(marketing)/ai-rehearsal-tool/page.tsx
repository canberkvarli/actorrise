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
    </div>
  );
}
