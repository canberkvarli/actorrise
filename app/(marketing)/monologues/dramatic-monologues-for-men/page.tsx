import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologues for Men",
  description: "Dramatic monologues for men for auditions. Search 19,000+ real pieces by intensity and length, avoid overdone choices, and find a piece that fits your type.",
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

const BULLETS = ["seoShelf.dramaticMen.b1", "seoShelf.dramaticMen.b2", "seoShelf.dramaticMen.b3"] as const;
const RELATED = [
  { href: "/dramatic-monologues", label: "seoShelf.dramaticMen.r1" },
  { href: "/monologues-for-men", label: "seoShelf.dramaticMen.r2" },
  { href: "/audition-monologues", label: "seoShelf.dramaticMen.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.dramaticMen" />} title={<T k="seoShelf.dramaticMen.h1" />} lede={<T k="seoShelf.dramaticMen.intro" />}>
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
