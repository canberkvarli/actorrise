import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Contemporary Monologues for Women",
  description: "Contemporary monologues for women from modern plays and screen. Search 7,500+ pieces by tone and length, skip the overdone ones, and walk in ready.",
  openGraph: {
    title: "Contemporary Monologues for Women | ActorRise",
    description: "Contemporary monologues for women from modern plays and screen. Searchable by tone and length, with an Overdone filter.",
    url: `${siteUrl}/monologues/contemporary-monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contemporary Monologues for Women | ActorRise",
    description: "Contemporary monologues for women from modern plays and screen. Searchable by tone and length, with an Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/contemporary-monologues-for-women` },
};

const H1 = "Contemporary monologues for women";
const INTRO = "Casting often asks for something contemporary, meaning modern and recognizable. Search real monologues for women from current plays, films, and TV, and filter by tone and length so the piece fits the room.";
const BULLETS: string[] = ["Modern pieces from real plays and screen, not invented text","Filter by tone, age range, and length","Overdone filter flags pieces casting hears constantly"];
const RELATED: { href: string; label: string }[] = [{"href":"/monologues/comedic-monologues-for-women","label":"comedic monologues for women"},{"href":"/contemporary-monologues","label":"contemporary monologues"},{"href":"/monologues-for-women","label":"monologues for women"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(modern voices.)" title={H1} lede={INTRO}>
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
