import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { COLLECTIONS } from "@/lib/monologueCollections";
import { getCorpusStats, type CorpusStats } from "@/lib/monologueSeo";

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

function longDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function faqItems(s: CorpusStats): { q: string; a: string; link?: { href: string; label: string } }[] {
  return [
    {
      q: "How big is the monologue database?",
      a: `${approx(s.pieces)} real monologues: ${fmt(s.plays)} from plays, ${fmt(s.film)} from film and ${fmt(s.tv)} from television, across more than two thousand sources. ${fmt(s.publicDomain)} of them are public domain and printed in full. It grows most weeks; the newest piece is dated on this page.`,
    },
    {
      q: "Are the monologues free to search and read?",
      a: "Yes. Searching is free and needs no card. A free account reads a set number of full pieces a month; Plus removes the limit and adds unlimited rehearsal with the AI scene partner.",
    },
    {
      q: "Are these real monologues or AI-generated?",
      a: "Real. The AI is in the search, not the writing. Every entry is a published piece with its character, source and author, so the text you rehearse is text a casting room will recognise.",
    },
    {
      q: "Can I filter out overdone pieces?",
      a: "Yes. Every piece carries an overdone score, from fresh to warhorse, and the search can hide the ones every actor brings.",
    },
    {
      q: "Can I search by play, show, theme or age?",
      a: "Yes. Type it the way you would say it: \"a monologue from Hamlet\", \"something about revenge\", \"comedic, teenager, under two minutes\". The browse pages below cover the most asked-for shelves.",
    },
    {
      q: "Where do the monologues come from?",
      a: "Public-domain plays, printed in full, and licensed or referenced contemporary sources, listed by character, work and length. ActorRise does not distribute copyrighted scripts. Full details: ",
      link: { href: "/sources", label: "Sources and copyright" },
    },
  ];
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

const CATEGORY_LINKS: { href: string; label: string }[] = [
  { href: "/dramatic-monologues", label: "Dramatic monologues" },
  { href: "/contemporary-monologues", label: "Contemporary monologues" },
  { href: "/shakespeare-monologues", label: "Shakespeare monologues" },
  { href: "/monologues-for-women", label: "Monologues for women" },
  { href: "/monologues-for-men", label: "Monologues for men" },
  { href: "/monologues/two-minute-monologues", label: "2 minute monologues" },
  { href: "/monologues/one-minute-monologues", label: "1 minute monologues" },
  { href: "/monologues/classical-monologues", label: "Classical monologues" },
];

function Shelf({ heading, note, slugs }: { heading: string; note: string; slugs: string[] }) {
  const pages = slugs.map(bySlug).filter((c): c is NonNullable<typeof c> => !!c);
  if (pages.length === 0) return null;
  return (
    <>
      <h3 className="font-semibold text-foreground mt-8 mb-1">{heading}</h3>
      <p className="text-sm text-muted-foreground mb-3">{note}</p>
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
  const items = faqItems(s);
  const added = longDate(s.lastAdded);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.link ? `${item.a}${item.link.label}.` : item.a },
    })),
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

  return (
    <>
      <StageHero
        direction="(the database.)"
        title={
          <>
            The <em className="italic text-primary">monologue database</em> built for actors
          </>
        }
        lede={`ActorRise is a searchable monologue database: ${approx(s.pieces)} real pieces from plays, film and television. You search by what you actually need, tone, length, gender, age, theme, the play, the show, and read the real text in seconds. Public-domain plays are printed in full.`}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetJsonLd) }} />

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">What is in it, counted</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4 text-sm">
          {[
            ["Monologues", s.pieces],
            ["From plays", s.plays],
            ["From film", s.film],
            ["From television", s.tv],
            ["Public domain, printed in full", s.publicDomain],
            ["Under two minutes", s.underTwoMinutes],
          ]
            .filter(([, n]) => (n as number) > 0)
            .map(([label, n]) => (
              <div key={label as string} className="flex justify-between gap-3 border-b border-border py-1.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="tabular-nums text-foreground">{fmt(n as number)}</dd>
              </div>
            ))}
        </dl>
        <p className="text-sm text-muted-foreground mb-12">
          {added ? `Newest piece added ${added}. ` : ""}
          Counts are from the live library and refresh weekly. Every piece is a published text with its
          character, source and author; nothing here was written by a model.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">How the search works</h2>
        <p className="text-muted-foreground mb-4">
          You do not have to guess the right keywords. Describe what you need the way you would say it out
          loud, and the search ranks pieces that fit:
        </p>
        <ul className="space-y-2 text-muted-foreground mb-6">
          {[
            "two minute dramatic monologue for a young woman",
            "comedic contemporary monologue for a man under 90 seconds",
            "a classical monologue that is not Shakespeare",
            "something from Euphoria, or anything with that feeling",
          ].map((q) => (
            <li key={q} className="flex gap-2">
              <span className="text-primary">·</span>
              <span className="italic">&ldquo;{q}&rdquo;</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-4 mb-14">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/">Search the database</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup">Start rehearsing</Link>
          </Button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Browse the database</h2>
        <p className="text-muted-foreground">
          Each page below is a real list from the library, not a landing page: the pieces, their characters,
          sources and running times, and the public-domain text in full.
        </p>
        <Shelf heading="By play, every speech printed in full" note="Public-domain plays, so the whole text is on the page." slugs={PLAY_PAGES} />
        <Shelf heading="By show" note="Copyrighted, so each entry names the character, piece and length and the search opens the rest." slugs={SHOW_PAGES} />
        <Shelf heading="By theme" note="Tagged across the whole library, classical and contemporary." slugs={THEME_PAGES} />
        <Shelf heading="By gender, age, tone and length" note="The audition asks that never change." slugs={SHELF_PAGES} />
        <h3 className="font-semibold text-foreground mt-8 mb-3">Wider categories</h3>
        <div className="flex flex-wrap gap-2 mb-14">
          {CATEGORY_LINKS.map((c) => (
            <Link
              prefetch={false}
              key={c.href}
              href={c.href}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {c.label}
            </Link>
          ))}
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">Common questions</h2>
        <div className="space-y-6 mb-14">
          {items.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold text-foreground mb-1">{item.q}</h3>
              <p className="text-muted-foreground">
                {item.a}
                {item.link && (
                  <Link prefetch={false} href={item.link.href} className="text-primary underline underline-offset-4">
                    {item.link.label}
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Search {approx(s.pieces)} monologues now
          </h2>
          <p className="text-muted-foreground mb-6">
            Find the right piece, read the real text, and rehearse it. Free to start, no credit card.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link prefetch={false} href="/">Search the database</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link prefetch={false} href="/signup">Start rehearsing</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
