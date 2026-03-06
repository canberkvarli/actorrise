import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Scene Partner AI: Rehearse Scenes with an AI Reader",
  description:
    "Rehearse scenes with AI that reads the other lines out loud. Run sides, film & TV scenes, and monologues before your audition. No scheduling, no favors. Free to try.",
  openGraph: {
    title: "Scene Partner AI | ActorRise",
    description:
      "Rehearse scenes with AI that reads the other lines. Run sides, film & TV scenes, and monologues. Free to try.",
    url: `${siteUrl}/scene-partner-ai`,
  },
  alternates: { canonical: `${siteUrl}/scene-partner-ai` },
};

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Scene partner AI: rehearse anytime, no scheduling
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        ScenePartner reads the other lines out loud so you can rehearse scenes on your own. Run your
        sides before an audition, practice film and TV scenes, or work through monologues with
        context. It listens for your lines and responds with the next cue.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">Run sides</strong>: paste or upload your audition
            sides and rehearse with AI reading the other parts.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">Film & TV scenes</strong>: rehearse from 14,000+
            scene references in the database.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <strong className="text-foreground">No scheduling</strong>: rehearse at 2am, on the
            subway, or five minutes before your audition. No favors needed.
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/audition-ai">Learn more about Audition AI</Link>
        </Button>
      </div>
    </div>
  );
}
