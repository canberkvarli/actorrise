import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { english } from "@/components/marketing/seo/english";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "How to Find a Monologue for an Audition (Fast)",
  description:
    "How to find an audition monologue that fits you: pick the length, tone, and type the room wants, skip the overdone ones, and search 19,000+ real pieces.",
  openGraph: {
    title: "How to Find a Monologue for an Audition | ActorRise",
    description:
      "The fast way to find an audition monologue that actually fits you: length, tone, type, and a searchable database of 19,000+ real pieces.",
    url: `${siteUrl}/how-to-find-a-monologue`,
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Find a Monologue for an Audition | ActorRise",
    description:
      "The fast way to find an audition monologue that actually fits you: length, tone, type, and 19,000+ real pieces.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/how-to-find-a-monologue` },
};

const FAQ_ITEMS: { q: MessageKey; a: MessageKey; link?: { href: string; label: MessageKey } }[] = [
  { q: "seoHowTo.faq.q1", a: "seoHowTo.faq.a1" },
  { q: "seoHowTo.faq.q2", a: "seoHowTo.faq.a2" },
  { q: "seoHowTo.faq.q3", a: "seoHowTo.faq.a3" },
  { q: "seoHowTo.faq.q4", a: "seoHowTo.faq.a4" },
  {
    q: "seoHowTo.faq.q5",
    a: "seoHowTo.faq.a5",
    link: { href: "/sources", label: "seoHowTo.faq.link" },
  },
];

const CATEGORY_LINKS: { href: string; label: MessageKey }[] = [
  { href: "/dramatic-monologues", label: "seoCommon.cat.dramatic" },
  { href: "/contemporary-monologues", label: "seoCommon.cat.contemporary" },
  { href: "/shakespeare-monologues", label: "seoCommon.cat.shakespeare" },
  { href: "/monologues-for-women", label: "seoCommon.cat.women" },
  { href: "/monologues-for-men", label: "seoCommon.cat.men" },
  { href: "/monologues/two-minute-monologues", label: "seoCommon.cat.twoMin" },
  { href: "/monologues/one-minute-monologues", label: "seoCommon.cat.oneMin" },
  { href: "/monologues/classical-monologues", label: "seoCommon.cat.classical" },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: english(item.q),
    acceptedAnswer: {
      "@type": "Answer",
      text: item.link ? `${english(item.a)}${english(item.link.label)}.` : english(item.a),
    },
  })),
};

export default function HowToFindAMonologuePage() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.howTo" />}
        title={
          <SeoT
            k="seoHowTo.title"
            slots={{ em: <em className="italic text-primary"><T k="seoHowTo.titleEm" /></em> }}
          />
        }
        lede={<T k="seoHowTo.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />

        <div className="flex flex-wrap gap-4 mb-14">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/"><T k="seoHowTo.findNow" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
          </Button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          <T k="seoHowTo.s1Title" />
        </h2>
        <p className="text-muted-foreground mb-4">
          <T k="seoHowTo.s1Intro" />
        </p>
        <ul className="space-y-3 text-muted-foreground mb-12">
          {(["length", "tone", "era", "you"] as const).map((b) => (
            <li key={b} className="flex gap-2">
              <span className="text-primary">·</span>
              <span>
                <SeoT
                  k={`seoHowTo.${b}`}
                  slots={{ strong: <strong className="text-foreground"><T k={`seoHowTo.${b}Strong`} /></strong> }}
                />
              </span>
            </li>
          ))}
        </ul>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          <T k="seoHowTo.s2Title" />
        </h2>
        <p className="text-muted-foreground mb-4">
          <T k="seoHowTo.s2Intro" />
        </p>
        <ul className="space-y-2 text-muted-foreground mb-4">
          {(["s1", "s2", "s3", "s4"] as const).map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-primary">·</span>
              <span className="italic">&ldquo;<T k={`seoHowTo.samples.${s}`} />&rdquo;</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mb-12">
          <SeoT
            k="seoHowTo.s2Outro"
            slots={{
              link: (
                <Link prefetch={false} href="/monologue-finder" className="text-primary underline underline-offset-4">
                  <T k="seoHowTo.s2Link" />
                </Link>
              ),
            }}
          />
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          <T k="seoHowTo.s3Title" />
        </h2>
        <p className="text-muted-foreground mb-4">
          <T k="seoHowTo.s3p1" />
        </p>
        <p className="text-muted-foreground mb-12">
          <T k="seoHowTo.s3p2" />
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          <T k="seoHowTo.s4Title" />
        </h2>
        <p className="text-muted-foreground mb-12">
          <T k="seoHowTo.s4p" />
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          <T k="seoHowTo.browseTitle" />
        </h2>
        <div className="flex flex-wrap gap-2 mb-12">
          {CATEGORY_LINKS.map((c) => (
            <Link prefetch={false}
              key={c.href}
              href={c.href}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <T k={c.label} />
            </Link>
          ))}
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">
          <T k="seoCommon.commonQuestions" />
        </h2>
        <div className="space-y-6 mb-14">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold text-foreground mb-1"><T k={item.q} /></h3>
              <p className="text-muted-foreground">
                <T k={item.a} />
                {item.link && (
                  <Link prefetch={false}
                    href={item.link.href}
                    className="text-primary underline underline-offset-4"
                  >
                    <T k={item.link.label} />
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            <T k="seoHowTo.ctaTitle" />
          </h2>
          <p className="text-muted-foreground mb-6">
            <T k="seoHowTo.ctaBody" />
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link prefetch={false} href="/"><T k="seoHowTo.findNow" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
