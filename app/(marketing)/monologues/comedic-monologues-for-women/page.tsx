import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Comedic Monologues for Women",
  description: "Find comedic monologues for women for auditions. Search 19,000+ real pieces by length and tone, filter out overdone choices, and land the laugh.",
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

const BULLETS = ["seoShelf.comedicWomen.b1", "seoShelf.comedicWomen.b2", "seoShelf.comedicWomen.b3"] as const;
const RELATED = [
  { href: "/monologues/contemporary-monologues-for-women", label: "seoShelf.comedicWomen.r1" },
  { href: "/monologues-for-women", label: "seoShelf.comedicWomen.r2" },
  { href: "/audition-monologues", label: "seoShelf.comedicWomen.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.comedicWomen" />} title={<T k="seoShelf.comedicWomen.h1" />} lede={<T k="seoShelf.comedicWomen.intro" />}>
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
