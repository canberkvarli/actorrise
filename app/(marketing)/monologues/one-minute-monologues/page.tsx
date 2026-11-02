import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "One Minute Monologues",
  description: "One minute monologues for fast auditions and class. Search 19,000+ real pieces and filter to short monologues that fit a tight time limit.",
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

const BULLETS = ["seoShelf.oneMin.b1", "seoShelf.oneMin.b2", "seoShelf.oneMin.b3"] as const;
const RELATED = [
  { href: "/monologues/two-minute-monologues", label: "seoShelf.oneMin.r1" },
  { href: "/audition-monologues", label: "seoShelf.oneMin.r2" },
  { href: "/monologue-finder", label: "seoShelf.oneMin.r3" },
] as const;

export default function Page() {
  return (
    <>
      <StageHero direction={<T k="seoDirections.oneMin" />} title={<T k="seoShelf.oneMin.h1" />} lede={<T k="seoShelf.oneMin.intro" />}>
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
