import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

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

const FAQ_ITEMS: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "Does ActorRise write monologues with AI?",
    a: "No. The AI is in the search and the rehearsal, not the writing. Every monologue is a real published piece, so what you bring is something casting can recognize.",
  },
  {
    q: "What is ScenePartner?",
    a: "An AI reading partner. It reads the other lines in a scene so you can run sides or your monologue out loud anytime, without scheduling someone to feed you cues.",
  },
  {
    q: "What is Audition Mode?",
    a: "A focused setup with fit-to-type and Overdone filters, so you walk in with pieces that suit the role and feel fresh to casting.",
  },
  {
    q: "Is there a free tier?",
    a: "Yes, it’s free to start and no credit card is required. Paid plans unlock the full database, saved bookmarks, and ScenePartner rehearsal.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function AuditionAiPage() {
  return (
    <>
      <StageHero
        direction="(the callback.)"
        title={
          <>
            Audition AI that helps you <em className="italic text-primary">prep</em>, not replace
            performance
          </>
        }
        lede="ActorRise uses AI to help you find the right material and rehearse, without generating scripts or replacing the work you do as an actor. Everything you search and practice with is from real published plays and film/TV."
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
            <strong className="text-foreground">Monologue search</strong>: describe what you need in plain
            English. It matches you to 12,000+ real monologues by meaning, not just keywords.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">ScenePartner</strong>: rehearse scenes with AI that reads the
            other lines. Run sides, film/TV references, and your saved monologues so you can walk in ready.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Audition Mode</strong>: fit-to-type and Overdone filters so you
            show up with pieces that suit the role and feel fresh to casting.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>It finds and organizes real text. It doesn’t invent or generate monologues.</span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4 mb-16">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the search</Link>
        </Button>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        What the AI does, and what it doesn’t
      </h2>
      <p className="text-muted-foreground mb-4">
        A lot of “AI for actors” means a model writing fake scenes. ActorRise works the other way. The
        AI reads what you describe and points you to real published pieces, and it reads scene partner
        lines back to you so you can rehearse. It never writes the monologue.
      </p>
      <p className="text-muted-foreground mb-12">
        That matters in the room. Casting recognizes real material, and a piece you can attribute to a
        play or film holds up to questions in a way a generated one never will.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Monologue search
      </h2>
      <p className="text-muted-foreground mb-12">
        Type something like “contemporary dramatic monologue for a woman under two minutes” and get a
        ranked shortlist of real pieces that fit. No keyword guessing. Start from the{" "}
        <Link href="/monologue-finder" className="text-foreground font-medium underline hover:no-underline">
          monologue finder
        </Link>{" "}
        or browse{" "}
        <Link href="/audition-monologues" className="text-foreground font-medium underline hover:no-underline">
          audition monologues
        </Link>{" "}
        by type.
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        ScenePartner
      </h2>
      <p className="text-muted-foreground mb-12">
        Rehearsing alone is the hard part. ScenePartner reads the other lines so you can run a scene or
        a monologue out loud whenever you want, without booking a friend. See how it works on the{" "}
        <Link href="/scene-partner-ai" className="text-foreground font-medium underline hover:no-underline">
          ScenePartner page
        </Link>
        .
      </p>

      <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
        Audition Mode and the Overdone filter
      </h2>
      <p className="text-muted-foreground mb-4">
        When you’re prepping for a specific call, Audition Mode narrows things to your type and the
        role, and the Overdone filter flags pieces casting hears constantly so you can bring something
        they haven’t.
      </p>
      <p className="text-muted-foreground mb-12">
        I built ActorRise because I’m an actor, and I wanted prep tools that respect the craft instead
        of trying to do it for me.
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
          <Link href="/">Try the search</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
