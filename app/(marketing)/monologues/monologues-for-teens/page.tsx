import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Teens",
  description: "Monologues for teen actors and students. Search 7,500+ real pieces by age range, tone, and length to find audition and class material that fits.",
  openGraph: {
    title: "Monologues for Teens | ActorRise",
    description: "Monologues for teen actors, searchable by age range, tone, and length. Real published pieces, free to start.",
    url: `${siteUrl}/monologues/monologues-for-teens`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Teens | ActorRise",
    description: "Monologues for teen actors, searchable by age range, tone, and length. Real published pieces, free to start.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/monologues-for-teens` },
};

const H1 = "Monologues for teens";
const INTRO = "Teen actors need pieces that fit their age and read honestly, not adult speeches forced to work. Search real monologues by age range, tone, and length to find audition and class material that suits a younger performer.";
const BULLETS: string[] = ["Filter by age range so the piece fits a teen","Comedic and dramatic options for class or auditions","Real published text, free to start"];
const RELATED: { href: string; label: string }[] = [{"href":"/for-students","label":"students and educators"},{"href":"/audition-monologues","label":"audition monologues"},{"href":"/monologue-finder","label":"monologue finder"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(young performers.)" title={H1} lede={INTRO}>
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
