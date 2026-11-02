import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { COLLECTIONS } from "@/lib/monologueCollections";
import { getCorpusStats, type CorpusStats } from "@/lib/monologueSeo";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { english } from "@/components/marketing/seo/english";
import { T, type MessageKey } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

/*
 * This is the page ChatGPT cites. In September it sent 113 of the 160
 * chatgpt.com sessions here (GA4, 2026-10-10), because it answers "where do
 * I find monologues" with specifics. So the specifics are live: the counts
 * come from the corpus, the newest-piece date is printed, and every shelf
 * named below links to a page that lists it. Rebuilt weekly, which is eight
 * Supabase counts a week, not per visit; Vercel Hobby counts every request.
 */
export const revalidate = 604800;

export const metadata: Metadata = {
  title: "The Monologue Database for Actors | 19,000+ Real Pieces",
  description:
    "A searchable monologue database: 19,000+ real pieces from 2,000+ plays, films and TV shows, by tone, length, gender, age and theme. Public-domain plays printed in full. Free to start.",
  openGraph: {
    title: "The Monologue Database for Actors | ActorRise",
    description:
      "19,000+ real monologues from plays, film and TV, searchable in plain English. Public-domain plays printed in full. Free to start.",
    url: `${siteUrl}/monologue-database`,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Monologue Database for Actors | ActorRise",
    description:
      "19,000+ real monologues from plays, film and TV, searchable in plain English. Public-domain plays printed in full. Free to start.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologue-database` },
};

const fmt = (n: number) => n.toLocaleString("en-US");
/** "19,720" reads as a claim about today; "19,700+" stays true all week. */
const approx = (n: number) => `${fmt(Math.floor(n / 100) * 100)}+`;

type FaqItem = { q: MessageKey; a: MessageKey; link?: { href: string; label: MessageKey } };

const FAQ_ITEMS: FaqItem[] = [
  { q: "seoDatabase.faq.q1", a: "seoDatabase.faq.a1" },
  { q: "seoDatabase.faq.q2", a: "seoDatabase.faq.a2" },
  { q: "seoDatabase.faq.q3", a: "seoDatabase.faq.a3" },
  { q: "seoDatabase.faq.q4", a: "seoDatabase.faq.a4" },
  { q: "seoDatabase.faq.q5", a: "seoDatabase.faq.a5" },
  { q: "seoDatabase.faq.q6", a: "seoDatabase.faq.a6", link: { href: "/sources", label: "seoDatabase.faq.link" } },
];

/** The counts the first answer quotes: `approx` for the headline, `fmt` for the rest. */
function countVars(s: CorpusStats) {
  return {
    approx: { pieces: s.pieces },
    nums: { plays: s.plays, film: s.film, tv: s.tv, publicDomain: s.publicDomain },
  };
}

const bySlug = (slug: string) => COLLECTIONS.find((c) => c.slug === slug);

const PLAY_PAGES = [
  "hamlet-monologues",
  "macbeth-monologues",
  "romeo-and-juliet-monologues",
  "othello-monologues",
  "king-lear-monologues",
  "a-midsummer-nights-dream-monologues",
  "twelfth-night-monologues",
  "much-ado-about-nothing-monologues",
  "julius-caesar-monologues",
  "a-dolls-house-monologues",
  "medea-monologues",
];
const SHOW_PAGES = ["euphoria-monologues", "yellowjackets-monologues"];
const THEME_PAGES = ["monologues-about-love", "monologues-about-revenge", "monologues-about-jealousy", "monologues-about-grief"];
const SHELF_PAGES = [
  "comedic-monologues-for-women-under-2-minutes",
  "dramatic-monologues-for-women-under-2-minutes",
  "comedic-monologues-for-men-under-2-minutes",
  "dramatic-monologues-for-men-under-2-minutes",
  "one-minute-monologues-for-women",
  "one-minute-monologues-for-men",
  "classical-monologues-for-women",
  "contemporary-dramatic-monologues-for-women",
  "contemporary-dramatic-monologues-for-men",
  "contemporary-comedic-monologues-for-women",
  "monologues-for-women-over-40",
  "contemporary-monologues-for-teens",
  "comedic-monologues-for-teens",
  "dramatic-monologues-for-teens",
  "villain-monologues",
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

function Shelf({ heading, note, slugs }: { heading: MessageKey; note: MessageKey; slugs: string[] }) {
  const pages = slugs.map(bySlug).filter((c): c is NonNullable<typeof c> => !!c);
  if (pages.length === 0) return null;
  return (
    <>
      <h3 className="font-semibold text-foreground mt-8 mb-1"><T k={heading} /></h3>
      <p className="text-sm text-muted-foreground mb-3"><T k={note} /></p>
      <ul className="flex flex-wrap gap-2">
        {pages.map((c) => (
          <li key={c.slug}>
            <Link
              prefetch={false}
              href={`/monologues/${c.slug}`}
              className="inline-block rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {c.h1.em} {c.h1.rest.replace(/, (printed in full|by character)$/, "")}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function MonologueDatabasePage() {
  const s = await getCorpusStats();
  const counts = countVars(s);
  const englishCounts = {
    pieces: approx(s.pieces),
    plays: fmt(s.plays),
    film: fmt(s.film),
    tv: fmt(s.tv),
    publicDomain: fmt(s.publicDomain),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => {
      const a = english(item.a, englishCounts);
      return {
        "@type": "Question",
        name: english(item.q),
        acceptedAnswer: { "@type": "Answer", text: item.link ? `${a}${english(item.link.label)}.` : a },
      };
    }),
  };
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "ActorRise monologue database",
    description: `${approx(s.pieces)} monologues from plays, film and television, with character, source, author, tone, gender, age range, running time and themes. ${fmt(s.publicDomain)} public-domain pieces printed in full.`,
    url: `${siteUrl}/monologue-database`,
    creator: { "@type": "Organization", name: "ActorRise", url: siteUrl },
    isAccessibleForFree: true,
    ...(s.lastAdded ? { dateModified: s.lastAdded } : {}),
    variableMeasured: ["character", "source", "author", "tone", "gender", "age range", "running time", "themes", "overdone score"],
  };

  const stats: [MessageKey, number][] = [
    ["seoDatabase.stats.pieces", s.pieces],
    ["seoDatabase.stats.plays", s.plays],
    ["seoDatabase.stats.film", s.film],
    ["seoDatabase.stats.tv", s.tv],
    ["seoDatabase.stats.publicDomain", s.publicDomain],
    ["seoDatabase.stats.underTwo", s.underTwoMinutes],
  ];

  return (
    <>
      <StageHero
        direction={<T k="seoDirections.database" />}
        title={
          <SeoT
            k="seoDatabase.title"
            slots={{ em: <em className="italic text-primary"><T k="seoDatabase.titleEm" /></em> }}
          />
        }
        lede={<SeoT k="seoDatabase.lede" approx={{ count: s.pieces }} />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4"><T k="seoDatabase.countedTitle" /></h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 text-sm">
          {stats
            .filter(([, n]) => n > 0)
            .map(([label, n]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-border py-1.5">
                <dt className="text-muted-foreground"><T k={label} /></dt>
                <dd className="tabular-nums text-foreground"><SeoT k="seoDatabase.stat" nums={{ n }} /></dd>
              </div>
            ))}
        </dl>
        <p className="text-sm text-muted-foreground mb-12">
          {s.lastAdded ? <SeoT k="seoDatabase.newest" dates={{ date: s.lastAdded }} /> : ""}
          <T k="seoDatabase.countsNote" />
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4"><T k="seoDatabase.howTitle" /></h2>
        <p className="text-muted-foreground mb-4">
          <T k="seoDatabase.howIntro" />
        </p>
        <ul className="space-y-2 text-muted-foreground mb-6">
          {(["s1", "s2", "s3", "s4"] as const).map((q) => (
            <li key={q} className="flex gap-2">
              <span className="text-primary">·</span>
              <span className="italic">&ldquo;<T k={`seoDatabase.samples.${q}`} />&rdquo;</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 mb-14">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/"><T k="seoDatabase.searchDb" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
          </Button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2"><T k="seoDatabase.browseTitle" /></h2>
        <p className="text-muted-foreground">
          <T k="seoDatabase.browseIntro" />
        </p>
        <Shelf heading="seoDatabase.shelf.playH" note="seoDatabase.shelf.playN" slugs={PLAY_PAGES} />
        <Shelf heading="seoDatabase.shelf.showH" note="seoDatabase.shelf.showN" slugs={SHOW_PAGES} />
        <Shelf heading="seoDatabase.shelf.themeH" note="seoDatabase.shelf.themeN" slugs={THEME_PAGES} />
        <Shelf heading="seoDatabase.shelf.shelfH" note="seoDatabase.shelf.shelfN" slugs={SHELF_PAGES} />
        <h3 className="font-semibold text-foreground mt-8 mb-3"><T k="seoDatabase.wider" /></h3>
        <div className="flex flex-wrap gap-2 mb-14">
          {CATEGORY_LINKS.map((c) => (
            <Link
              prefetch={false}
              key={c.href}
              href={c.href}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <T k={c.label} />
            </Link>
          ))}
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6"><T k="seoCommon.commonQuestions" /></h2>
        <div className="space-y-6 mb-14">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold text-foreground mb-1"><T k={item.q} /></h3>
              <p className="text-muted-foreground">
                <SeoT k={item.a} approx={counts.approx} nums={counts.nums} />
                {item.link && (
                  <Link prefetch={false} href={item.link.href} className="text-primary underline underline-offset-4">
                    <T k={item.link.label} />
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            <SeoT k="seoDatabase.ctaTitle" approx={{ count: s.pieces }} />
          </h2>
          <p className="text-muted-foreground mb-6">
            <T k="seoDatabase.ctaBody" />
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link prefetch={false} href="/"><T k="seoDatabase.searchDb" /></Link>
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
