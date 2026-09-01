import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "The Monologue Database for Actors | 8,500+ Real Pieces",
  description:
    "One of the largest monologue databases online: 8,500+ real pieces from plays, film, and TV, searchable by tone, length, gender, and type. Free to start.",
  openGraph: {
    title: "The Monologue Database for Actors | ActorRise",
    description:
      "8,500+ real monologues, searchable by tone, length, and type. Not AI-generated text. Free tier available.",
    url: `${siteUrl}/monologue-database`,
  },
  twitter: {
    card: "summary_large_image",
    title: "The Monologue Database for Actors | ActorRise",
    description:
      "8,500+ real monologues, searchable by tone, length, and type. Not AI-generated text. Free tier available.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologue-database` },
};

const FAQ_ITEMS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "How big is the monologue database?",
    a: "Over 8,500 real monologues from plays, film, and TV, and it keeps growing. You can search all of it by tone, length, gender, and type.",
  },
  {
    q: "Are the monologues free to search?",
    a: "Yes. There is a free tier and no credit card is needed to search and read. Paid plans unlock unlimited rehearsals with the AI.",
  },
  {
    q: "Are these real monologues or AI-generated?",
    a: "Real. The AI is in the search, not the writing. Every entry is a real published piece, so the text you rehearse is text casting will recognize.",
  },
  {
    q: "Can I filter out overdone pieces?",
    a: "Yes. The overdone filter hides the warhorses every actor brings so you can find something fresh that still fits your tone and type.",
  },
  {
    q: "Where do the monologues come from?",
    a: "From public domain and licensed sources. ActorRise organizes real published text and does not distribute copyrighted play scripts. Full details: ",
    link: { href: "/sources", label: "Sources & copyright" },
  },
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

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.link ? `${item.a}${item.link.label}.` : item.a,
    },
  })),
};

export default function MonologueDatabasePage() {
  return (
    <>
      <StageHero
        direction="(the database.)"
        title={
          <>
            The <em className="italic text-primary">monologue database</em> built for actors
          </>
        }
        lede="ActorRise is a searchable monologue database with 8,500+ real pieces from plays, film, and TV. Instead of scrolling anthologies or generic lists, you search by what you actually need, tone, length, gender, and type, and read the real text in seconds."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />

        <ul className="space-y-3 text-muted-foreground mb-10">
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>8,500+ real monologues from plays, film, and TV, not AI-generated text</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>Search by tone, length, gender, and type in plain English</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>Overdone filter to skip the warhorses and bring something fresh</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>Rehearse any piece with the AI right after you find it</span>
          </li>
        </ul>
        <div className="flex flex-wrap gap-4 mb-16">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/">Search the database</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link href="/signup">Get started free</Link>
          </Button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          What is in the database
        </h2>
        <p className="text-muted-foreground mb-12">
          Over 8,500 real monologues, organized so you can actually find the right one: classical and
          contemporary, comedic and dramatic, for every gender and casting type, from 30 seconds to
          several minutes. Each entry is a real published piece with its source, not something an AI
          wrote.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          How the search works
        </h2>
        <p className="text-muted-foreground mb-4">
          You do not have to guess the right keywords. Describe what you need the way you would say it
          out loud, and the search ranks pieces that fit:
        </p>
        <ul className="space-y-2 text-muted-foreground mb-12">
          {[
            "two minute dramatic monologue for a young woman",
            "comedic contemporary monologue for a man under 90 seconds",
            "a classical monologue that is not Shakespeare",
          ].map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-primary">·</span>
              <span className="italic">&ldquo;{s}&rdquo;</span>
            </li>
          ))}
        </ul>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          Browse the database by category
        </h2>
        <div className="flex flex-wrap gap-2 mb-12">
          {CATEGORY_LINKS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {c.label}
            </Link>
          ))}
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">
          Common questions
        </h2>
        <div className="space-y-6 mb-14">
          {FAQ_ITEMS.map((item) => (
            <div key={item.q}>
              <h3 className="font-semibold text-foreground mb-1">{item.q}</h3>
              <p className="text-muted-foreground">
                {item.a}
                {item.link && (
                  <Link href={item.link.href} className="text-primary underline underline-offset-4">
                    {item.link.label}
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Search 8,500+ monologues now
          </h2>
          <p className="text-muted-foreground mb-6">
            Find the right piece, read the real text, and rehearse it. Free to start, no credit card.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/">Search the database</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link href="/signup">Get started free</Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
