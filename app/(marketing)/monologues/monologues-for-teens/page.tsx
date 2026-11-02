import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Teens",
  description: "Monologues for teen actors and students. Search 19,000+ real pieces by age range, tone, and length to find audition and class material that fits.",
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

const BULLETS = ["seoShelf.teens.b1", "seoShelf.teens.b2", "seoShelf.teens.b3"] as const;
const RELATED = [
  { href: "/for-students", label: "seoShelf.teens.r1" },
  { href: "/audition-monologues", label: "seoShelf.teens.r2" },
  { href: "/monologue-finder", label: "seoShelf.teens.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.teens" />} title={<T k="seoShelf.teens.h1" />} lede={<T k="seoShelf.teens.intro" />}>
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
