import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Movie Monologues for Auditions",
  description: "Movie monologues from real films for auditions and reels. Search pieces pulled from screenplays by tone, length, and character type.",
  openGraph: {
    title: "Movie Monologues for Auditions | ActorRise",
    description: "Movie monologues drawn from real films, searchable by tone, length, and character type. Rehearse them with ScenePartner.",
    url: `${siteUrl}/monologues/movie-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Movie Monologues for Auditions | ActorRise",
    description: "Movie monologues drawn from real films, searchable by tone, length, and character type. Rehearse them with ScenePartner.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/movie-monologues` },
};

const H1 = "Movie monologues for auditions";
const INTRO = "Film monologues can be great for reels and contemporary calls when you want something recognizable. Search pieces pulled from real screenplays by tone, length, and character type, then rehearse them with ScenePartner.";
const BULLETS: string[] = ["Pieces drawn from real films, not invented scenes","Filter by tone, length, and character type","Rehearse with ScenePartner reading the other lines"];
const RELATED: { href: string; label: string }[] = [{"href":"/scene-partner-ai","label":"ScenePartner"},{"href":"/audition-monologues","label":"audition monologues"},{"href":"/contemporary-monologues","label":"contemporary monologues"}];

export default function Page() {
  return (
    <>
      <StageHero direction="(from the screen.)" title={H1} lede={INTRO}>
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
