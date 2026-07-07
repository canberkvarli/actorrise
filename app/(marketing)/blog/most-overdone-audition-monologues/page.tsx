import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { BLOG_POSTS } from "@/lib/blog/posts";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";
const post = BLOG_POSTS.find((p) => p.slug === "most-overdone-audition-monologues")!;
const url = `${siteUrl}/blog/${post.slug}`;

export const metadata: Metadata = {
  title: post.title,
  description: post.excerpt,
  openGraph: {
    type: "article",
    title: post.title,
    description: post.excerpt,
    url,
    publishedTime: post.date,
  },
  twitter: {
    card: "summary_large_image",
    title: post.title,
    description: post.excerpt,
    images: ["/opengraph-image"],
  },
  alternates: { canonical: url },
};

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: post.title,
  description: post.excerpt,
  datePublished: post.date,
  dateModified: post.date,
  author: { "@type": "Person", name: "Canberk Varli", url: `${siteUrl}/about` },
  publisher: {
    "@type": "Organization",
    name: "ActorRise",
    logo: { "@type": "ImageObject", url: `${siteUrl}/icon-512.png` },
  },
  mainEntityOfPage: { "@type": "WebPage", "@id": url },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function Page() {
  return (
    <>
      <StageHero
        direction="(warhorse warning.)"
        title={
          <>
            The most <em className="italic text-primary">overdone</em> audition monologues (and what to do instead)
          </>
        }
      />
      <article className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        {formatDate(post.date)} · {post.readingMinutes} min read · by Canberk
      </p>

      <div className="space-y-5 text-muted-foreground leading-relaxed">
        <p>
          I’m an actor, and I’ve sat in enough audition waiting rooms to hear the same monologues over
          and over. You can almost feel the room go a little flat when the reader recognizes the first
          line. This isn’t a definitive ranking. It’s the pieces I, and a lot of casting people, hear
          constantly, why they can quietly work against you, and what I’d do instead.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground pt-6">
          Why an overdone monologue works against you
        </h2>
        <p>
          A great monologue done well is never the problem. The problem is comparison. When casting
          has heard a speech fifty times, they aren’t meeting your choices fresh, they’re measuring
          you against every version they already know. You spend your ninety seconds climbing out of
          that hole instead of just being good. A lesser-known piece lets them watch you, not the
          material.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground pt-6">
          How to tell if your monologue is overdone
        </h2>
        <ul className="space-y-2">
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>It’s one of the five most famous speeches in a play everyone has read.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>It went viral as a film or TV scene people quote.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>Your teacher assigned it to half the class.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>You picked it because it’s “a classic,” not because it fits you.</span>
          </li>
        </ul>
        <p>
          None of these make a piece bad. They just mean you’re walking in with company.
        </p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground pt-6">
          The classical pieces you’ll hear in every waiting room
        </h2>
        <p>
          Shakespeare and the classics get recycled the most, partly because they’re required and
          partly because they’re free. Commonly cited as overdone:
        </p>
        <ul className="space-y-2">
          <li className="flex gap-2"><span className="text-primary">·</span><span>“To be or not to be” from Hamlet</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>“Tomorrow, and tomorrow, and tomorrow” from Macbeth</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>The St. Crispin’s Day speech from Henry V</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>Puck’s closing speech from A Midsummer Night’s Dream</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>Juliet’s “Gallop apace” and the balcony speeches</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>Lady Macbeth’s “Out, damned spot”</span></li>
        </ul>
        <p>All extraordinary. All heard constantly.</p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground pt-6">
          The film and TV monologues everyone memorizes
        </h2>
        <p>
          Screen monologues feel fresh until you remember everyone watched the same movies. The ones
          that come up again and again:
        </p>
        <ul className="space-y-2">
          <li className="flex gap-2"><span className="text-primary">·</span><span>“You can’t handle the truth” from A Few Good Men</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>The Ezekiel 25:17 speech from Pulp Fiction</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>The park bench speech from Good Will Hunting</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>“Greed is good” from Wall Street</span></li>
          <li className="flex gap-2"><span className="text-primary">·</span><span>The “always be closing” speech from Glengarry Glen Ross</span></li>
        </ul>
        <p>Great writing, but casting has heard them in a hundred self tapes.</p>

        <h2 className="text-2xl font-semibold tracking-tight text-foreground pt-6">
          What to do instead
        </h2>
        <p>
          Being fresh isn’t about being obscure for its own sake. It’s about walking in with something
          that fits you and lets casting actually see you. A few things that help:
        </p>
        <ul className="space-y-3">
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Use the Overdone filter.</strong> ActorRise flags
              pieces that get used constantly, so you can skip them on purpose. Start from the{" "}
              <Link href="/monologue-finder" className="text-foreground font-medium underline hover:no-underline">
                monologue finder
              </Link>
              .
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Search by what fits you, not what’s famous.</strong>{" "}
              Describe your type, tone, and length, and let the search surface pieces you’d never find
              flipping through a “best of” list.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Go one step less famous.</strong> The same playwright
              usually has three speeches nobody brings.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary">·</span>
            <span>
              <strong className="text-foreground">Rehearse it until it’s yours.</strong> Run it out loud
              with{" "}
              <Link href="/scene-partner-ai" className="text-foreground font-medium underline hover:no-underline">
                ScenePartner
              </Link>{" "}
              so the piece feels lived in, not recited.
            </span>
          </li>
        </ul>
        <p>
          Pick something that suits you and do it honestly, and it almost doesn’t matter what everyone
          else is bringing. That’s the whole game.
        </p>
      </div>

      <div className="mt-12 pt-10 border-t border-border/60 flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/monologue-finder">Find a fresh monologue</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
      </div>
    </article>
    </>
  );
}
