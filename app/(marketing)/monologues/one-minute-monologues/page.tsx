import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "One Minute Monologues",
  description: "One minute monologues for fast auditions and class. Search 12,000+ real pieces and filter to short monologues that fit a tight time limit.",
  openGraph: {
    title: "One Minute Monologues | ActorRise",
    description: "Short one minute monologues for auditions, class, and self tapes. Real pieces, searchable by tone and type.",
    url: `${siteUrl}/monologues/one-minute-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "One Minute Monologues | ActorRise",
    description: "Short one minute monologues for auditions, class, and self tapes. Real pieces, searchable by tone and type.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/one-minute-monologues` },
};

const H1 = "One minute monologues";
const INTRO = "Some calls give you sixty seconds, and going over can cost you. Search real monologues and filter to short pieces so you have a strong one minute option ready for auditions, class, or a quick self tape.";
const BULLETS: string[] = ["Filter to short pieces that fit a one minute slot","Comedic or dramatic, for any type","Real published text, with an Overdone filter"];
const RELATED: { href: string; label: string }[] = [{"href":"/monologues/two-minute-monologues","label":"two minute monologues"},{"href":"/audition-monologues","label":"audition monologues"},{"href":"/monologue-finder","label":"monologue finder"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(sixty seconds.)" title={H1} lede={INTRO}>
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
