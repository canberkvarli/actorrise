import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { english } from "@/components/marketing/seo/english";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Audition AI: Monologue Search, ScenePartner & Audition Mode",
  description:
    "AI for auditions: monologue search, ScenePartner for rehearsal, and Audition Mode. Real scripts, not AI-generated. Less time searching, more time rehearsing.",
  openGraph: {
    title: "Audition AI | ActorRise",
    description:
      "Monologue search, ScenePartner, and Audition Mode. AI that helps you prep with real scripts.",
    url: `${siteUrl}/audition-ai`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Audition AI | ActorRise",
    description:
      "Monologue search, ScenePartner, and Audition Mode. AI that helps you prep with real scripts.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/audition-ai` },
};

const FAQ_ITEMS: { q: MessageKey; a: MessageKey }[] = [
  { q: "seoAuditionAi.faq.q1", a: "seoAuditionAi.faq.a1" },
  { q: "seoAuditionAi.faq.q2", a: "seoAuditionAi.faq.a2" },
  { q: "seoAuditionAi.faq.q3", a: "seoAuditionAi.faq.a3" },
  { q: "seoAuditionAi.faq.q4", a: "seoAuditionAi.faq.a4" },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: english(item.q),
    acceptedAnswer: { "@type": "Answer", text: english(item.a) },
  })),
};

const linkClass = "text-foreground font-medium underline hover:no-underline";

export default function AuditionAiPage() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.auditionAi" />}
        title={
          <SeoT
            k="seoAuditionAi.title"
            slots={{ em: <em className="italic text-primary"><T k="seoAuditionAi.titleEm" /></em> }}
          />
        }
        lede={<T k="seoAuditionAi.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT k="seoAuditionAi.b1" slots={{ strong: <strong className="text-foreground"><T k="seoAuditionAi.b1Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT k="seoAuditionAi.b2" slots={{ strong: <strong className="text-foreground">ScenePartner</strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT k="seoAuditionAi.b3" slots={{ strong: <strong className="text-foreground"><T k="seoAuditionAi.b3Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span><T k="seoAuditionAi.b4" /></span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4 mb-16">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/"><T k="seoCommon.trySearch" /></Link>
        </Button>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAuditionAi.whatTitle" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoAuditionAi.what1" />
      </p>
      <p className="text-muted-foreground mb-12">
        <T k="seoAuditionAi.what2" />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAuditionAi.searchTitle" />
      </h2>
      <p className="text-muted-foreground mb-12">
        <SeoT
          k="seoAuditionAi.search"
          slots={{
            finder: (
              <Link prefetch={false} href="/monologue-finder" className={linkClass}>
                <T k="seoCommon.links.finder" />
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

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        ScenePartner
      </h2>
      <p className="text-muted-foreground mb-12">
        <SeoT
          k="seoAuditionAi.sp"
          slots={{
            link: (
              <Link prefetch={false} href="/scene-partner-ai" className={linkClass}>
                <T k="seoAuditionAi.spLink" />
              </Link>
            ),
          }}
        />
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        <T k="seoAuditionAi.modeTitle" />
      </h2>
      <p className="text-muted-foreground mb-4">
        <T k="seoAuditionAi.mode1" />
      </p>
      <p className="text-muted-foreground mb-12">
        <T k="seoAuditionAi.mode2" />
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
          <Link prefetch={false} href="/"><T k="seoCommon.trySearch" /></Link>
        </Button>
      </div>
      </div>
    </>
  );
}
