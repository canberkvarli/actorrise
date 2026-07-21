import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Comedic Monologues for Women",
  description: "Find comedic monologues for women for auditions. Search 12,000+ real pieces by length and tone, filter out overdone choices, and land the laugh.",
  openGraph: {
    title: "Comedic Monologues for Women | ActorRise",
    description: "Comedic monologues for women, searchable by length and tone. Real published pieces, Overdone filter, free to start.",
    url: `${siteUrl}/monologues/comedic-monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Comedic Monologues for Women | ActorRise",
    description: "Comedic monologues for women, searchable by length and tone. Real published pieces, Overdone filter, free to start.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/comedic-monologues-for-women` },
};

const H1 = "Comedic monologues for women";
const INTRO = "Comedy is hard to fake in an audition, so the piece has to fit you. Search 12,000+ real monologues by tone and length to find a comedic piece for a woman that actually lands, then filter out the ones casting hears every day.";
const BULLETS: string[] = ["Search by length, like a comedic monologue under two minutes","Real pieces from plays, films, and TV, never AI-generated","Overdone filter so you bring something casting hasn't heard ten times"];
const RELATED: { href: string; label: string }[] = [{"href":"/monologues/contemporary-monologues-for-women","label":"contemporary monologues for women"},{"href":"/monologues-for-women","label":"monologues for women"},{"href":"/audition-monologues","label":"audition monologues"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(land the laugh.)" title={H1} lede={INTRO}>
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/signup">Get started free</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link href="/">Try the search</Link>
          </Button>
        </div>
      </StageHero>
      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
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
      </div>
    </>
  );
}
