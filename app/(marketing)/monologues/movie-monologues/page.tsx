import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

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

const BULLETS = ["seoShelf.movie.b1", "seoShelf.movie.b2", "seoShelf.movie.b3"] as const;
const RELATED = [
  { href: "/scene-partner-ai", label: "seoShelf.movie.r1" },
  { href: "/audition-monologues", label: "seoShelf.movie.r2" },
  { href: "/contemporary-monologues", label: "seoShelf.movie.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.movie" />} title={<T k="seoShelf.movie.h1" />} lede={<T k="seoShelf.movie.intro" />}>
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/"><T k="seoCommon.trySearch" /></Link>
          </Button>
        </div>
      </StageHero>
      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <ul className="space-y-3 text-muted-foreground mb-10">
          {BULLETS.map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-primary">·</span>
              <span><T k={b} /></span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mb-10">
          <T k="seoCommon.related" />
          {RELATED.map((r, i) => (
            <span key={r.href}>
              {i > 0 ? " · " : ""}
              <Link prefetch={false} href={r.href} className="text-foreground font-medium underline hover:no-underline">
                <T k={r.label} />
              </Link>
            </span>
          ))}
        </p>
      </div>
    </>
  );
}
