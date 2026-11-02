import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Contemporary Monologues for Women",
  description: "Contemporary monologues for women from modern plays and screen. Search 19,000+ pieces by tone and length, skip the overdone ones, and walk in ready.",
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

const BULLETS = ["seoShelf.contemporaryWomen.b1", "seoShelf.contemporaryWomen.b2", "seoShelf.contemporaryWomen.b3"] as const;
const RELATED = [
  { href: "/monologues/comedic-monologues-for-women", label: "seoShelf.contemporaryWomen.r1" },
  { href: "/contemporary-monologues", label: "seoShelf.contemporaryWomen.r2" },
  { href: "/monologues-for-women", label: "seoShelf.contemporaryWomen.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.contemporaryWomen" />} title={<T k="seoShelf.contemporaryWomen.h1" />} lede={<T k="seoShelf.contemporaryWomen.intro" />}>
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
