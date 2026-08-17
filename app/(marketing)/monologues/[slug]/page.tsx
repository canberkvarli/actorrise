import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPublicMonologue, idFromSlug, monologueSlug, type PublicMonologue } from "@/lib/monologueSeo";
import { displayableAuthor } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

// ISR: render on first request, cache for a day. Keeps 12k pages cheap + crawlable.
export const revalidate = 86400;

type Params = { params: Promise<{ slug: string }> };

function displayTitle(m: PublicMonologue): string {
  const hasPlay = m.playTitle && !m.character.toLowerCase().includes(m.playTitle.toLowerCase());
  return hasPlay ? `${m.character} Monologue from ${m.playTitle}` : `${m.character} Monologue`;
}

function readableLength(seconds: number | null): string | null {
  if (!seconds) return null;
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return mm > 0 ? `${mm}:${ss.toString().padStart(2, "0")} min` : `${ss} sec`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const id = idFromSlug(slug);
  if (!id) return {};
  const m = await getPublicMonologue(id);
  if (!m) return {};
  const title = displayTitle(m);
  const canonical = `${siteUrl}/monologues/${monologueSlug(m)}`;
  const src = m.playTitle ? ` from ${m.playTitle}` : "";
  // "by Unknown" in a meta description on 12k indexed pages is worse than no
  // byline at all. 99.6% of TV rows carry the literal string "Unknown".
  const by = displayableAuthor(m.author) ? ` by ${displayableAuthor(m.author)}` : "";
  const len = readableLength(m.durationSeconds);
  const description = m.isPublicDomain
    ? `Read ${m.character}'s monologue${src}${by} in full, then rehearse it out loud on ActorRise${len ? `. ${len}` : ""}. Free to start.`
    : `${m.character}'s monologue${src}${by}. See the details and rehearse it on ActorRise. Free to start.`;
  return {
    // Root layout appends " | ActorRise" via its title template — don't double it.
    title,
    description,
    alternates: { canonical },
    openGraph: { title: `${title} | ActorRise`, description, url: canonical },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ActorRise`,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export default async function PublicMonologuePage({ params }: Params) {
  const { slug } = await params;
  const id = idFromSlug(slug);
  if (!id) notFound();
  const m = await getPublicMonologue(id);
  if (!m) notFound();

  const title = displayTitle(m);
  const meta = [m.gender, m.tone, readableLength(m.durationSeconds)].filter(Boolean) as string[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: title,
    inLanguage: "en",
    ...(m.author ? { author: { "@type": "Person", name: m.author } } : {}),
    ...(m.playTitle ? { isPartOf: { "@type": "CreativeWork", name: m.playTitle } } : {}),
    ...(m.isPublicDomain ? { text: m.text } : {}),
    publisher: { "@type": "Organization", name: "ActorRise", url: siteUrl },
  };

  return (
    <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        // Escape "<" so monologue text can never break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <p className="text-sm uppercase tracking-[0.18em] text-primary mb-3">Monologue</p>
      <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground mb-1">
        {m.playTitle ? (
          <>
            From <span className="text-foreground">{m.playTitle}</span>
          </>
        ) : (
          "Monologue"
        )}
        {displayableAuthor(m.author) ? ` by ${displayableAuthor(m.author)}` : null}
      </p>
      {meta.length > 0 && (
        <p className="text-sm text-muted-foreground capitalize mb-8">{meta.join("  ·  ")}</p>
      )}

      <div className="flex flex-wrap gap-3 mb-10">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href={`/monologue/${m.id}/work`}>Rehearse this free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Find more monologues</Link>
        </Button>
      </div>

      {m.isPublicDomain ? (
        <article className="font-typewriter whitespace-pre-wrap leading-relaxed text-foreground/90 mb-12">
          {m.text}
        </article>
      ) : (
        <div className="rounded-xl border border-border bg-muted/30 p-6 mb-12">
          <p className="text-muted-foreground">
            This piece is from a copyrighted{" "}
            {m.sourceType === "film" ? "film" : m.sourceType === "tv" ? "TV series" : "work"}, so the
            full text isn&apos;t published here. You can bring your own copy of the lines and rehearse it
            on ActorRise.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">
          Rehearse {m.character}&apos;s monologue
        </h2>
        <p className="text-muted-foreground mb-6">
          Run it out loud with a spotlight that follows your voice, line by line, until it&apos;s off the
          page. Free to start, no credit card.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href={`/monologue/${m.id}/work`}>Rehearse free</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link href="/signup">Get started free</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
