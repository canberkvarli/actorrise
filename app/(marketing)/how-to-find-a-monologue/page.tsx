import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "How to Find a Monologue for an Audition (Fast)",
  description:
    "How to find an audition monologue that fits you: pick the length, tone, and type the room wants, skip the overdone ones, and search 12,000+ real pieces.",
  openGraph: {
    title: "How to Find a Monologue for an Audition | ActorRise",
    description:
      "The fast way to find an audition monologue that actually fits you: length, tone, type, and a searchable database of 12,000+ real pieces.",
    url: `${siteUrl}/how-to-find-a-monologue`,
  },
  twitter: {
    card: "summary_large_image",
    title: "How to Find a Monologue for an Audition | ActorRise",
    description:
      "The fast way to find an audition monologue that actually fits you: length, tone, type, and 12,000+ real pieces.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/how-to-find-a-monologue` },
};

const FAQ_ITEMS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "How do I find a monologue that fits me?",
    a: "Start with what the audition asks for (length, tone, contemporary or classical), then narrow to your age range and type. Describe that in plain English and search a real database instead of scrolling anthologies. ActorRise ranks pieces that match your tone, length, and type in seconds.",
  },
  {
    q: "Where can I find monologues for free?",
    a: "There is a free tier on ActorRise and you do not need a credit card to try it. You can search and read real published monologues right away; paid plans unlock unlimited rehearsals with the AI.",
  },
  {
    q: "How long should an audition monologue be?",
    a: "Most auditions want 60 seconds to 2 minutes unless the breakdown says otherwise. Always time it out loud, and have a shorter cut ready in case they ask you to trim.",
  },
  {
    q: "How do I avoid an overdone monologue?",
    a: "The most cut pieces are the ones every actor brings. Use the overdone filter to hide warhorses and surface fresher options that still fit your tone and type.",
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

export default function HowToFindAMonologuePage() {
  return (
    <>
      <StageHero
        direction="(finding the piece.)"
        title={
          <>
            How to find a <em className="italic text-primary">monologue</em> for your audition
          </>
        }
        lede="Finding the right monologue is where most of the stress lives: the wrong length, an overdone piece, or something that just is not you. Here is a simple way to find one that fits, fast, without flipping through anthologies the night before a callback."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />

        <div className="flex flex-wrap gap-4 mb-14">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/">Find a monologue now</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link href="/signup">Get started free</Link>
          </Button>
        </div>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          1. Start with what the audition actually needs
        </h2>
        <p className="text-muted-foreground mb-4">
          Before you fall in love with a piece, get clear on the brief. The fastest way to waste an
          hour is to pick something beautiful that the room did not ask for. Nail down four things:
        </p>
        <ul className="space-y-3 text-muted-foreground mb-12">
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Length.</strong> Most auditions want 60 seconds to
              2 minutes. If the breakdown gives a number, respect it, and time yourself out loud.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Tone.</strong> Comedic or dramatic. Match the
              project. A serious drama callback is not the place for your best stand up bit.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Era.</strong> Contemporary or classical. Some
              programs and schools ask for one of each, so know which you are building.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">You.</strong> Your age range, casting type, and
              what you play believably. The piece should sit inside your wheelhouse, not audition for
              a different actor.
            </span>
          </li>
        </ul>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          2. Search by meaning, not by luck
        </h2>
        <p className="text-muted-foreground mb-4">
          You can dig through monologue books and generic lists, but that means scrolling and guessing
          at keywords. It is faster to describe what you need the way you would say it to a friend and
          let a real database do the sorting:
        </p>
        <ul className="space-y-2 text-muted-foreground mb-4">
          {[
            "two minute dramatic monologue for a young woman",
            "comedic monologue for a man, contemporary, under 90 seconds",
            "a classical monologue that is not Shakespeare",
            "modern breakup monologue, female, high stakes",
          ].map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-primary">·</span>
              <span className="italic">&ldquo;{s}&rdquo;</span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mb-12">
          That is exactly what the{" "}
          <Link href="/monologue-finder" className="text-primary underline underline-offset-4">
            ActorRise monologue finder
          </Link>{" "}
          does. It reads what you describe and ranks real monologues that fit your tone, length,
          gender, and type, pulled from 12,000+ pieces across plays, film, and TV.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          3. Pick one that works, and skip the overdone ones
        </h2>
        <p className="text-muted-foreground mb-4">
          A good audition monologue is playable, active, and fresh. Once you have a shortlist, choose
          the piece that lets you do something, has a real shift or stakes, and is not the same
          warhorse every other actor is bringing that day. The most cut pieces are the famous ones, so
          use the overdone filter to hide them and surface something the panel has not heard twelve
          times already.
        </p>
        <p className="text-muted-foreground mb-12">
          Read the full text, check the source, and make sure it stands on its own out of context. If
          it needs the whole play to make sense, keep looking.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          4. Rehearse it until it is off the page
        </h2>
        <p className="text-muted-foreground mb-12">
          Finding the piece is half the job. Once it is yours, run it out loud until it is off book and
          in your body. On ActorRise you can rehearse a monologue right after you find it: a spotlight
          follows your voice line by line so you can get it off the page before you ever walk into the
          room.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
          Browse by what you need
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
                  <Link
                    href={item.link.href}
                    className="text-primary underline underline-offset-4"
                  >
                    {item.link.label}
                  </Link>
                )}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
            Find your monologue in seconds
          </h2>
          <p className="text-muted-foreground mb-6">
            Describe what you need, get a shortlist of real pieces, and rehearse the strongest one.
            Free to start, no credit card.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href="/">Find a monologue now</Link>
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
