import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { english } from "@/components/marketing/seo/english";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Audition Monologues: Classical, Contemporary, Comedic",
  description:
    "Browse and search audition monologues by style, length, and role type. Find fresh pieces quickly with AI-powered discovery and overdone filtering.",
  openGraph: {
    title: "Audition Monologues | ActorRise",
    description:
      "Audition monologues for every casting need. Classical, contemporary, comedic. 19,000+ pieces, AI search, Overdone filter.",
    url: `${siteUrl}/audition-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Audition Monologues | ActorRise",
    description:
      "Audition monologues for every casting need. Classical, contemporary, comedic. 19,000+ pieces, AI search, Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/audition-monologues` },
};

const FAQ_ITEMS: { q: MessageKey; a: MessageKey; link?: { href: string; label: MessageKey } }[] = [
  { q: "seoAudition.faq.q1", a: "seoAudition.faq.a1" },
  { q: "seoAudition.faq.q2", a: "seoAudition.faq.a2" },
  { q: "seoAudition.faq.q3", a: "seoAudition.faq.a3" },
  {
    q: "seoAudition.faq.q4",
    a: "seoAudition.faq.a4",
    link: { href: "/sources", label: "seoAudition.faq.link" },
  },
];

const SAMPLE_SEARCHES = ["s1", "s2", "s3", "s4", "s5"] as const;

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

const linkClass = "text-foreground font-medium underline hover:no-underline";

export default function AuditionMonologuesPage() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.audition" />}
        title={
          <SeoT
            k="seoAudition.title"
            slots={{ em: <em className="italic text-primary"><T k="seoAudition.titleEm" /></em> }}
          />
        }
        lede={<T k="seoAudition.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/"><T k="seoAudition.searchBtn" /></Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT
              k="seoAudition.b1"
              slots={{
                link: (
                  <Link prefetch={false} href="/monologues/classical-monologues" className={linkClass}>
                    <T k="seoAudition.b1Link" />
                  </Link>
                ),
              }}
            />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT
              k="seoAudition.b2"
              slots={{
                link: (
                  <Link prefetch={false} href="/monologues/dramatic-contemporary" className={linkClass}>
                    <T k="seoAudition.b2Link" />
                  </Link>
                ),
              }}
            />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link prefetch={false} href="/monologues/comedic-woman-under-2-minutes" className={linkClass}>
              <T k="seoAudition.b3Link" />
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span><T k="seoAudition.b4" /></span>
        </li>
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAudition.pickTitle" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoAudition.pickIntro" />
      </p>
      <ul className="space-y-3 text-muted-foreground mb-12">
        {(["p1", "p2", "p3"] as const).map((p) => (
          <li key={p} className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <SeoT
                k={`seoAudition.${p}`}
                slots={{ strong: <strong className="text-foreground"><T k={`seoAudition.${p}Strong`} /></strong> }}
              />
            </span>
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAudition.browseTitle" />
      </h2>
      <p className="text-muted-foreground mb-12">
        <SeoT
          k="seoAudition.browse"
          slots={{
            classical: (
              <Link prefetch={false} href="/monologues/classical-monologues" className={linkClass}>
                <T k="seoAudition.lClassical" />
              </Link>
            ),
            dramatic: (
              <Link prefetch={false} href="/monologues/dramatic-contemporary" className={linkClass}>
                <T k="seoAudition.lDramatic" />
              </Link>
            ),
            comedic: (
              <Link prefetch={false} href="/monologues/comedic-woman-under-2-minutes" className={linkClass}>
                <T k="seoAudition.lComedic" />
              </Link>
            ),
            finder: (
              <Link prefetch={false} href="/monologue-finder" className={linkClass}>
                <T k="seoCommon.links.finder" />
              </Link>
            ),
          }}
        />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoCommon.searchesActorsRun" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoAudition.searchesIntro" />
      </p>
      <ul className="space-y-2 text-muted-foreground mb-12">
        {SAMPLE_SEARCHES.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="text-primary">·</span>
            <span className="italic">“<T k={`seoAudition.samples.${s}`} />”</span>
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAudition.realTitle" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <SeoT
          k="seoAudition.real1"
          slots={{
            scenePartner: (
              <Link prefetch={false} href="/scene-partner-ai" className={linkClass}>
                ScenePartner
              </Link>
            ),
          }}
        />
      </p>
      <p className="text-muted-foreground mb-12">
        <T k="seoAudition.real2" />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">
        <T k="seoCommon.faqTitle" />
      </h2>
      <ul className="space-y-4 mb-12">
        {FAQ_ITEMS.map((item) => (
          <li key={item.q}>
            <details className="group rounded-lg border border-border/60 bg-card/40 overflow-hidden">
              <summary className="list-none cursor-pointer px-4 py-3 font-medium text-foreground hover:bg-card/60 transition-colors flex items-center justify-between gap-2">
                <span><T k={item.q} /></span>
                <span className="text-muted-foreground group-open:rotate-180 transition-transform shrink-0" aria-hidden>
                  ▼
                </span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-muted-foreground text-sm md:text-base leading-relaxed border-t border-border/40">
                <T k={item.a} />
                {item.link && (
                  <>
                    {" "}
                    <Link prefetch={false} href={item.link.href} className="text-primary hover:underline">
                      <T k={item.link.label} />
                    </Link>
                    .
                  </>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/"><T k="seoAudition.searchBtn" /></Link>
        </Button>
      </div>
      </div>
    </>
  );
}
