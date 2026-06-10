import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Shakespeare Monologues for Women",
  description: "Shakespeare monologues for women from across the plays. Search by character, tone, and length to find a classical piece that fits your audition.",
  openGraph: {
    title: "Shakespeare Monologues for Women | ActorRise",
    description: "Shakespeare monologues for women across the comedies, tragedies, and histories. Searchable by character, tone, and length.",
    url: `${siteUrl}/monologues/shakespeare-monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Shakespeare Monologues for Women | ActorRise",
    description: "Shakespeare monologues for women across the comedies, tragedies, and histories. Searchable by character, tone, and length.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/shakespeare-monologues-for-women` },
};

const H1 = "Shakespeare monologues for women";
const INTRO = "Shakespeare shows up at most classical auditions, and the right speech can set you apart. Search monologues for women across the plays by character, tone, and length, from the well known to the rarely heard.";
const BULLETS: string[] = ["Pieces from across the comedies, tragedies, and histories","Filter by character, tone, and length","Overdone filter so you skip the speeches everyone brings"];
const RELATED: { href: string; label: string }[] = [{"href":"/shakespeare-monologues","label":"Shakespeare monologues"},{"href":"/monologues/classical-monologues","label":"classical monologues"},{"href":"/monologues-for-women","label":"monologues for women"}];

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
