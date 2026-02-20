import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Audition AI: Monologue Search, ScenePartner & Audition Mode | ActorRise",
  description:
    "AI for auditions: monologue search, ScenePartner for rehearsal, and Audition Mode. Real scripts, not AI-generated. Less time searching, more time rehearsing.",
  openGraph: {
    title: "Audition AI | ActorRise",
    description:
      "Monologue search, ScenePartner, and Audition Mode. AI that helps you prep with real scripts.",
    url: `${siteUrl}/audition-ai`,
  },
  alternates: { canonical: `${siteUrl}/audition-ai` },
};

export default function AuditionAiPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Audition AI that helps you prep, not replace performance
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        ActorRise uses AI to help you find the right material and rehearse, without generating
        scripts or replacing the work you do as an actor. Everything you search and practice with is
        from real published plays and film/TV.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Monologue search</strong>: describe what you need in plain English.
            We match you to 8,600+ real monologues by meaning, not just keywords.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">ScenePartner</strong>: rehearse scenes with AI that reads the other
            lines. Run sides, film/TV references, and your saved monologues so you can walk in ready.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Audition Mode</strong>: fit-to-type and Overdone filters so you show
            up with pieces that suit the role and feel fresh to casting.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>We find and organize real text. We don’t invent or generate monologues.</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        Built by an actor, for actors. Free tier available.{" "}
        <Link href="/about" className="text-foreground font-medium underline hover:no-underline">
          Learn more about ActorRise
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the search</Link>
        </Button>
      </div>
    </div>
  );
}
