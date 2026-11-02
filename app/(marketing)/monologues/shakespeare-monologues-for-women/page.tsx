import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Shakespeare Monologues for Women",
  description: "Shakespeare monologues for women from across the plays. Search by character, tone, and length to find a classical piece that fits your audition.",
  openGraph: {
    title: "Shakespeare Monologues for Women | ActorRise",
    description: "Shakespeare monologues for women across the comedies, tragedies, and histories. Searchable by character, tone, and length.",
    url: `${siteUrl}/monologues/shakespeare-monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Shakespeare Monologues for Women | ActorRise",
    description: "Shakespeare monologues for women across the comedies, tragedies, and histories. Searchable by character, tone, and length.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/shakespeare-monologues-for-women` },
};

const BULLETS = ["seoShelf.shakespeareWomen.b1", "seoShelf.shakespeareWomen.b2", "seoShelf.shakespeareWomen.b3"] as const;
const RELATED = [
  { href: "/shakespeare-monologues", label: "seoShelf.shakespeareWomen.r1" },
  { href: "/monologues/classical-monologues", label: "seoShelf.shakespeareWomen.r2" },
  { href: "/monologues-for-women", label: "seoShelf.shakespeareWomen.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.shakespeareWomen" />} title={<T k="seoShelf.shakespeareWomen.h1" />} lede={<T k="seoShelf.shakespeareWomen.intro" />}>
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
