import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Two Minute Monologues",
  description: "Two minute monologues for auditions. Search 19,000+ real pieces and filter by tone and type to find a strong two minute monologue that fits the call.",
  openGraph: {
    title: "Two Minute Monologues | ActorRise",
    description: "Two minute monologues for auditions, searchable by tone and type. Real published pieces with an Overdone filter.",
    url: `${siteUrl}/monologues/two-minute-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Two Minute Monologues | ActorRise",
    description: "Two minute monologues for auditions, searchable by tone and type. Real published pieces with an Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/two-minute-monologues` },
};

const BULLETS = ["seoShelf.twoMin.b1", "seoShelf.twoMin.b2", "seoShelf.twoMin.b3"] as const;
const RELATED = [
  { href: "/monologues/one-minute-monologues", label: "seoShelf.twoMin.r1" },
  { href: "/audition-monologues", label: "seoShelf.twoMin.r2" },
  { href: "/monologue-finder", label: "seoShelf.twoMin.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.twoMin" />} title={<T k="seoShelf.twoMin.h1" />} lede={<T k="seoShelf.twoMin.intro" />}>
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
