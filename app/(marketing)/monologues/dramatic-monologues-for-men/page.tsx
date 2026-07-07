import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologues for Men",
  description: "Dramatic monologues for men for auditions. Search 7,500+ real pieces by intensity and length, avoid overdone choices, and find a piece that fits your type.",
  openGraph: {
    title: "Dramatic Monologues for Men | ActorRise",
    description: "Dramatic monologues for men, searchable by intensity, length, and type. Real published pieces with an Overdone filter.",
    url: `${siteUrl}/monologues/dramatic-monologues-for-men`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatic Monologues for Men | ActorRise",
    description: "Dramatic monologues for men, searchable by intensity, length, and type. Real published pieces with an Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/dramatic-monologues-for-men` },
};

const H1 = "Dramatic monologues for men";
const INTRO = "A strong dramatic monologue gives you somewhere to go. Search real pieces for men by intensity, age range, and length, and bring something that suits your type instead of the speech everyone else is doing.";
const BULLETS: string[] = ["Real dramatic pieces from plays, films, and TV","Filter by length, like a dramatic monologue under two minutes","Overdone filter so you stand out, not blend in"];
const RELATED: { href: string; label: string }[] = [{"href":"/dramatic-monologues","label":"dramatic monologues"},{"href":"/monologues-for-men","label":"monologues for men"},{"href":"/audition-monologues","label":"audition monologues"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(dig deep.)" title={H1} lede={INTRO}>
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
