import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Audition Monologues: Classical, Contemporary, Comedic | ActorRise",
  description:
    "Browse and search audition monologues by style, length, and role type. Find fresh pieces quickly with AI-powered discovery and overdone filtering.",
  openGraph: {
    title: "Audition Monologues | ActorRise",
    description:
      "Audition monologues for every casting need. Classical, contemporary, comedic. 8,600+ pieces, AI search, Overdone filter.",
    url: `${siteUrl}/audition-monologues`,
  },
  alternates: { canonical: `${siteUrl}/audition-monologues` },
};

export default function AuditionMonologuesPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Audition monologues for every casting need
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Whether you need classical, contemporary, or comedic audition monologues, ActorRise lets you
        search 8,600+ real pieces by style, length, gender, and tone. AI finds what fits so you spend
        less time digging and more time rehearsing.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link href="/monologues/classical-monologues" className="text-foreground font-medium underline hover:no-underline">
              Classical monologues
            </Link>{" "}
            : Shakespeare and beyond
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link href="/monologues/dramatic-contemporary" className="text-foreground font-medium underline hover:no-underline">
              Dramatic contemporary
            </Link>{" "}
            : from modern plays
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link href="/monologues/comedic-woman-under-2-minutes" className="text-foreground font-medium underline hover:no-underline">
              Comedic (e.g. woman under 2 minutes)
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so you can bring something different to the room</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        All pieces are from published plays and licensed sources (no AI-generated scripts). Free tier
        available.{" "}
        <Link href="/sources" className="text-foreground font-medium underline hover:no-underline">
          See sources & copyright
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Search audition monologues</Link>
        </Button>
      </div>
    </div>
  );
}
