import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { english } from "@/components/marketing/seo/english";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologue Finder for Actors | Find Audition Pieces Fast",
  description:
    "Use ActorRise's monologue finder to search 19,000+ real monologues by tone, length, and character type. No keyword guessing. Free to start.",
  openGraph: {
    title: "Monologue Finder for Actors | ActorRise",
    description:
      "Find your next audition piece in seconds. 19,000+ monologues, AI search, no keyword hunting. Free tier available.",
    url: `${siteUrl}/monologue-finder`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologue Finder for Actors | ActorRise",
    description:
      "Find your next audition piece in seconds. 19,000+ monologues, AI search, no keyword hunting. Free tier available.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologue-finder` },
};

// Page FAQ, also emitted as FAQPage JSON-LD below so it stays in sync with what's shown.
// The copy lives in lib/i18n/messages/en/seo.ts; the JSON-LD reads its English.
const FAQ_ITEMS: { q: MessageKey; a: MessageKey; link?: { href: string; label: MessageKey } }[] = [
  { q: "seoFinder.faq.q1", a: "seoFinder.faq.a1" },
  { q: "seoFinder.faq.q2", a: "seoFinder.faq.a2" },
  { q: "seoFinder.faq.q3", a: "seoFinder.faq.a3" },
  {
    q: "seoFinder.faq.q4",
    a: "seoFinder.faq.a4",
    link: { href: "/sources", label: "seoFinder.faq.link" },
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

export default function MonologueFinderPage() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.finder" />}
        title={
          <SeoT
            k="seoFinder.title"
            slots={{ em: <em className="italic text-primary"><T k="seoFinder.titleEm" /></em> }}
          />
        }
        lede={<T k="seoFinder.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <ul className="space-y-3 text-muted-foreground mb-10">
        {(["b1", "b2", "b3", "b4"] as const).map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-primary">·</span>
            <span><T k={`seoFinder.${b}`} /></span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-4 mb-16">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/"><T k="seoFinder.tryFinder" /></Link>
        </Button>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoFinder.howTitle" />
      </h2>
      <ol className="space-y-4 text-muted-foreground mb-12">
        {(["step1", "step2", "step3"] as const).map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="text-primary font-semibold tabular-nums">{i + 1}.</span>
            <span>
              <SeoT
                k={`seoFinder.${step}`}
                slots={{ strong: <strong className="text-foreground"><T k={`seoFinder.${step}Strong`} /></strong> }}
              />
            </span>
          </li>
        ))}
      </ol>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoCommon.searchesActorsRun" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoFinder.searchesIntro" />
      </p>
      <ul className="space-y-2 text-muted-foreground mb-4">
        {SAMPLE_SEARCHES.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="text-primary">·</span>
            <span className="italic">“<T k={`seoFinder.samples.${s}`} />”</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mb-12">
        <T k="seoFinder.searchesOutro" />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoFinder.realTitle" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoFinder.real1" />
      </p>
      <p className="text-muted-foreground mb-12">
        <T k="seoFinder.real2" />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoFinder.builtTitle" />
      </h2>
      <p className="text-muted-foreground mb-12">
        <SeoT
          k="seoFinder.built"
          slots={{
            college: (
              <Link prefetch={false} href="/for-students" className={linkClass}>
                <T k="seoFinder.lCollege" />
              </Link>
            ),
            teacher: (
              <Link prefetch={false} href="/for-teachers" className={linkClass}>
                <T k="seoFinder.lTeacher" />
              </Link>
            ),
            scenePartner: (
              <Link prefetch={false} href="/scene-partner-ai" className={linkClass}>
                ScenePartner
              </Link>
            ),
            audition: (
              <Link prefetch={false} href="/audition-monologues" className={linkClass}>
                <T k="seoCommon.links.audition" />
              </Link>
            ),
          }}
        />
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
          <Link prefetch={false} href="/"><T k="seoFinder.tryFinder" /></Link>
        </Button>
      </div>
      </div>
    </>
  );
}
