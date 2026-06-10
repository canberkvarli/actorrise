import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Two Minute Monologues",
  description: "Two minute monologues for auditions. Search 7,500+ real pieces and filter by tone and type to find a strong two minute monologue that fits the call.",
  openGraph: {
    title: "Two Minute Monologues | ActorRise",
    description: "Two minute monologues for auditions, searchable by tone and type. Real published pieces with an Overdone filter.",
    url: `${siteUrl}/monologues/two-minute-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Two Minute Monologues | ActorRise",
    description: "Two minute monologues for auditions, searchable by tone and type. Real published pieces with an Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/two-minute-monologues` },
};

const H1 = "Two minute monologues";
const INTRO = "Two minutes is the most common audition length, long enough to show range without losing the room. Search real monologues and filter by tone and type to find a two minute piece that fits.";
const BULLETS: string[] = ["Filter to pieces that land around two minutes","Classical, contemporary, comedic, or dramatic","Overdone filter so your two minutes feel fresh"];
const RELATED: { href: string; label: string }[] = [{"href":"/monologues/one-minute-monologues","label":"one minute monologues"},{"href":"/audition-monologues","label":"audition monologues"},{"href":"/monologue-finder","label":"monologue finder"}];

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        {H1}
      </h1>
      <p className="text-lg text-muted-foreground mb-8">{INTRO}</p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        {BULLETS.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-primary">·</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mb-10">
        Related:{" "}
        {RELATED.map((r, i) => (
          <span key={r.href}>
            {i > 0 ? " · " : ""}
            <Link href={r.href} className="text-foreground font-medium underline hover:no-underline">
              {r.label}
            </Link>
          </span>
        ))}
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
