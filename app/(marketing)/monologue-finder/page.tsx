import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologue Finder for Actors | Find Audition Pieces Fast",
  description:
    "Use ActorRise's monologue finder to search 7,500+ real monologues by tone, length, and character type. No keyword guessing. Free to start.",
  openGraph: {
    title: "Monologue Finder for Actors | ActorRise",
    description:
      "Find your next audition piece in seconds. 7,500+ monologues, AI search, no keyword hunting. Free tier available.",
    url: `${siteUrl}/monologue-finder`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologue Finder for Actors | ActorRise",
    description:
      "Find your next audition piece in seconds. 7,500+ monologues, AI search, no keyword hunting. Free tier available.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologue-finder` },
};

// Page FAQ, also emitted as FAQPage JSON-LD below so it stays in sync with what's shown.
const FAQ_ITEMS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "How is this different from a normal monologue list?",
    a: "Lists make you scroll and guess at keywords. The finder reads what you describe in plain English and ranks pieces that actually fit your tone, length, and type, so you skip the digging.",
  },
  {
    q: "Are the monologues free?",
    a: "There’s a free tier, and you don’t need a credit card to try it. Paid plans unlock the full database, saved bookmarks, and ScenePartner rehearsal.",
  },
  {
    q: "Can I search by length, gender, and tone?",
    a: "Yes. Describe the length (for example under two minutes), gender, tone, and style, and filter the shortlist until it fits the room you’re walking into.",
  },
  {
    q: "Where do the monologues come from?",
    a: "From public domain and licensed sources. ActorRise organizes real published text and doesn’t distribute copyrighted play scripts. Full details: ",
    link: { href: "/sources", label: "Sources & copyright" },
  },
];

const SAMPLE_SEARCHES = [
  "two minute dramatic monologue for a young woman",
  "comedic monologue for a man, contemporary, under 90 seconds",
  "a classical monologue that is not Shakespeare",
  "modern breakup monologue, female, high stakes",
  "uplifting monologue for a college audition",
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

export default function MonologueFinderPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Monologue finder: find your next audition piece in seconds
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        ActorRise is a monologue finder and database built for actors. Instead of scrolling books or
        generic lists, you describe what you need in plain English and get a shortlist of real
        monologues in seconds. No keyword guessing, no flipping through anthologies the night before
        a callback.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>One of the largest searchable monologue databases online</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>AI search that understands “comedic woman under 2 minutes” or “angry contemporary male”</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Real scripts from playwrights, not AI-generated text</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so you can bring something fresh to the room</span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4 mb-16">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the monologue finder</Link>
        </Button>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        How the monologue finder works
      </h2>
      <ol className="space-y-4 text-muted-foreground mb-12">
        <li className="flex gap-3">
          <span className="text-primary font-semibold tabular-nums">1.</span>
          <span>
            <strong className="text-foreground">Describe the piece you need.</strong> Type something
            like “comedic woman under two minutes” or “intense contemporary male for a drama
            callback.” The search reads meaning, not just exact keywords.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="text-primary font-semibold tabular-nums">2.</span>
          <span>
            <strong className="text-foreground">Scan a ranked shortlist.</strong> You get real
            monologues that match your tone, length, gender, and style, pulled from plays, films, and
            TV.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="text-primary font-semibold tabular-nums">3.</span>
          <span>
            <strong className="text-foreground">Save, filter, and rehearse.</strong> Bookmark the
            ones you like, hide overdone pieces, and take the strongest option into the room.
          </span>
        </li>
      </ol>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Searches actors actually run
      </h2>
      <p className="text-muted-foreground mb-4">
        You don’t have to translate what you need into the right keywords. Type it the way you’d say
        it to a friend:
      </p>
      <ul className="space-y-2 text-muted-foreground mb-4">
        {SAMPLE_SEARCHES.map((s) => (
          <li key={s} className="flex gap-2">
            <span className="text-primary">·</span>
            <span className="italic">“{s}”</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mb-12">
        Every result is a real published piece, so you can trust the text and look up the source.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Real scripts, not AI-generated lines
      </h2>
      <p className="text-muted-foreground mb-4">
        ActorRise doesn’t invent monologues. The AI is in the search, not the writing. Every result
        is a real piece from a play, film, or TV script, so what you rehearse is what casting will
        recognize. When a piece gets overused, the Overdone filter flags it, so you can bring
        something fresh instead of the monologue three other people read that same day.
      </p>
      <p className="text-muted-foreground mb-12">
        I built ActorRise because I’m an actor, and finding the right monologue used to eat hours I’d
        rather spend rehearsing.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Built for actors, students, and coaches
      </h2>
      <p className="text-muted-foreground mb-12">
        Whether you’re prepping a professional audition, a{" "}
        <Link href="/for-students" className="text-foreground font-medium underline hover:no-underline">
          college audition
        </Link>
        , or coaching a class as a{" "}
        <Link href="/for-teachers" className="text-foreground font-medium underline hover:no-underline">
          teacher
        </Link>
        , the finder works the same way. Once you’ve picked your piece, rehearse it out loud with{" "}
        <Link href="/scene-partner-ai" className="text-foreground font-medium underline hover:no-underline">
          ScenePartner
        </Link>
        , which reads the other lines so you can run it anytime. You can also browse curated{" "}
        <Link href="/audition-monologues" className="text-foreground font-medium underline hover:no-underline">
          audition monologues
        </Link>{" "}
        by style and length.
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
          <Link href="/">Try the monologue finder</Link>
        </Button>
      </div>
    </div>
  );
}
