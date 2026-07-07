import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Audition Monologues: Classical, Contemporary, Comedic",
  description:
    "Browse and search audition monologues by style, length, and role type. Find fresh pieces quickly with AI-powered discovery and overdone filtering.",
  openGraph: {
    title: "Audition Monologues | ActorRise",
    description:
      "Audition monologues for every casting need. Classical, contemporary, comedic. 7,500+ pieces, AI search, Overdone filter.",
    url: `${siteUrl}/audition-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Audition Monologues | ActorRise",
    description:
      "Audition monologues for every casting need. Classical, contemporary, comedic. 7,500+ pieces, AI search, Overdone filter.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/audition-monologues` },
};

const FAQ_ITEMS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "What makes a good audition monologue?",
    a: "Something that fits your type and the role, lands inside the time limit, and that casting hasn’t already heard ten times that day. The search and the Overdone filter help with all three.",
  },
  {
    q: "How long should an audition monologue be?",
    a: "Most calls want one to two minutes. You can filter by length, so search something like “dramatic monologue under two minutes” and trust the results fit.",
  },
  {
    q: "Do you have contemporary and classical pieces?",
    a: "Both. Browse classical (Shakespeare and beyond), dramatic contemporary, and comedic pieces, or just describe what you want and let the search sort it.",
  },
  {
    q: "Where do the monologues come from?",
    a: "From public domain and licensed sources. ActorRise organizes real published text and doesn’t distribute copyrighted play scripts. Full details: ",
    link: { href: "/sources", label: "Sources & copyright" },
  },
];

const SAMPLE_SEARCHES = [
  "contemporary dramatic monologue for a woman, under two minutes",
  "comedic audition monologue for a man",
  "a classical monologue that isn’t Shakespeare",
  "audition monologue for a teen",
  "high stakes monologue for a callback",
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

export default function AuditionMonologuesPage() {
  return (
    <>
      <StageHero
        direction="(the audition.)"
        title={
          <>
            <em className="italic text-primary">Audition</em> monologues for every casting need.
          </>
        }
        lede={
          <>
            Whether you need classical, contemporary, or comedic audition monologues, ActorRise lets you
            search 7,500+ real pieces by style, length, gender, and tone. The AI finds what fits, so you
            spend less time digging and more time rehearsing.
          </>
        }
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Search audition monologues</Link>
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
            <Link href="/monologues/classical-monologues" className="text-foreground font-medium underline hover:no-underline">
              Classical monologues
            </Link>{" "}
            : Shakespeare and beyond
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link href="/monologues/dramatic-contemporary" className="text-foreground font-medium underline hover:no-underline">
              Dramatic contemporary
            </Link>{" "}
            : from modern plays
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <Link href="/monologues/comedic-woman-under-2-minutes" className="text-foreground font-medium underline hover:no-underline">
              Comedic (e.g. woman under 2 minutes)
            </Link>
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so you can bring something different to the room</span>
        </li>
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        How to pick the right audition monologue
      </h2>
      <p className="text-muted-foreground mb-4">
        The strongest choice usually comes down to three things, and you can filter for all of them:
      </p>
      <ul className="space-y-3 text-muted-foreground mb-12">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Fit your type and the role.</strong> Search by gender,
            age range, and tone so the piece reads like it belongs to you.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Respect the time limit.</strong> Most calls want one to
            two minutes. Filter by length so you’re never cut off.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Bring something fresh.</strong> The Overdone filter flags
            pieces casting hears constantly, so you can stand out instead of blend in.
          </span>
        </li>
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Browse by type
      </h2>
      <p className="text-muted-foreground mb-12">
        Start with a category, then narrow it down:{" "}
        <Link href="/monologues/classical-monologues" className="text-foreground font-medium underline hover:no-underline">
          classical
        </Link>{" "}
        for Shakespeare and period pieces,{" "}
        <Link href="/monologues/dramatic-contemporary" className="text-foreground font-medium underline hover:no-underline">
          dramatic contemporary
        </Link>{" "}
        for modern plays, or{" "}
        <Link href="/monologues/comedic-woman-under-2-minutes" className="text-foreground font-medium underline hover:no-underline">
          comedic
        </Link>{" "}
        when you need to land a laugh. You can also start from the{" "}
        <Link href="/monologue-finder" className="text-foreground font-medium underline hover:no-underline">
          monologue finder
        </Link>{" "}
        and describe exactly what you’re after.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Searches actors actually run
      </h2>
      <p className="text-muted-foreground mb-4">
        Type it the way you’d say it out loud:
      </p>
      <ul className="space-y-2 text-muted-foreground mb-12">
        {SAMPLE_SEARCHES.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="text-primary">·</span>
            <span className="italic">“{s}”</span>
          </li>
        ))}
      </ul>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Real pieces, not AI-generated lines
      </h2>
      <p className="text-muted-foreground mb-4">
        Every monologue is from a published play or a licensed source, never invented by a model. The
        AI is in the search, so what you rehearse is text casting will recognize. Once you’ve picked
        your piece, run it out loud with{" "}
        <Link href="/scene-partner-ai" className="text-foreground font-medium underline hover:no-underline">
          ScenePartner
        </Link>
        .
      </p>
      <p className="text-muted-foreground mb-12">
        I’m an actor, and I built ActorRise so the search part takes minutes instead of an evening.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-6">
        Frequently asked questions
      </h2>
      <ul className="space-y-4 mb-12">
        {FAQ_ITEMS.map((item) => (
          <li key={item.q}>
            <details className="group rounded-lg border border-border/60 bg-card/40 overflow-hidden">
              <summary className="list-none cursor-pointer px-4 py-3 font-medium text-foreground hover:bg-card/60 transition-colors flex items-center justify-between gap-2">
                <span>{item.q}</span>
                <span className="text-muted-foreground group-open:rotate-180 transition-transform shrink-0" aria-hidden>
                  ▼
                </span>
              </summary>
              <div className="px-4 pb-4 pt-0 text-muted-foreground text-sm md:text-base leading-relaxed border-t border-border/40">
                {item.a}
                {item.link && (
                  <>
                    {" "}
                    <Link href={item.link.href} className="text-primary hover:underline">
                      {item.link.label}
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
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Search audition monologues</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
