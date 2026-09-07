import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GhostLightInlineCta } from "@/components/marketing/GhostLightInlineCta";
import { StageHero } from "@/components/marketing/StageHero";
import { COLLECTIONS, type Collection } from "@/lib/monologueCollections";
import { monologueSlug, type CollectionMonologue } from "@/lib/monologueSeo";
import { displayableAuthor } from "@/lib/utils";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

function readableLength(seconds: number | null): string | null {
  if (!seconds) return null;
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return mm > 0 ? `${mm}:${ss.toString().padStart(2, "0")}` : `0:${ss.toString().padStart(2, "0")}`;
}

function sourceWord(sourceType: string): string {
  if (sourceType === "film") return "film";
  if (sourceType === "tv") return "TV";
  return "play";
}

/**
 * One keyword collection: the hero, the actual list, related shelves, and the
 * same rehearse card the monologue pages end on. Server component; the list
 * is fetched by the [slug] route and handed in.
 */
export function MonologueCollectionPage({ collection, monologues }: { collection: Collection; monologues: CollectionMonologue[] }) {
  const searchHref = `/monologues?q=${encodeURIComponent(collection.query)}`;
  const related = collection.related
    .map((slug) => COLLECTIONS.find((c) => c.slug === slug))
    .filter((c): c is Collection => Boolean(c));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: collection.title,
    url: `${siteUrl}/monologues/${collection.slug}`,
    numberOfItems: monologues.length,
    itemListElement: monologues.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteUrl}/monologues/${monologueSlug(m)}`,
      name: m.playTitle ? `${m.character} from ${m.playTitle}` : m.character,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <StageHero
        direction={collection.direction}
        title={
          <>
            <em className="italic text-primary">{collection.h1.em}</em> {collection.h1.rest}
          </>
        }
        lede={collection.intro}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href={searchHref}>Search all of them</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
        {monologues.length === 0 ? (
          <p className="text-muted-foreground mb-10">
            Nothing matched this shelf right now.{" "}
            <Link href={searchHref} className="text-foreground font-medium underline hover:no-underline">
              Try the search
            </Link>
            .
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {monologues.map((m, i) => {
              const href = `/monologues/${monologueSlug(m)}`;
              const author = displayableAuthor(m.author);
              const len = readableLength(m.durationSeconds);
              return (
                <li key={m.id} className="py-5">
                  <div className="flex items-baseline gap-3">
                    <span className="font-typewriter text-xs text-muted-foreground w-6 shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-medium leading-snug">
                        <Link href={href} className="text-foreground hover:text-primary">
                          {m.character}
                          {m.playTitle ? (
                            <span className="text-muted-foreground font-normal"> from {m.playTitle}</span>
                          ) : null}
                        </Link>
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[author, sourceWord(m.sourceType), m.tone, len ? `${len} min` : null]
                          .filter(Boolean)
                          .join("  ·  ")}
                      </p>
                      {m.teaser ? (
                        <p className="mt-2 font-typewriter text-sm leading-relaxed text-foreground/80">{m.teaser}</p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          Length is estimated at a spoken pace of about 150 words a minute. Public-domain pieces are printed in
          full on their own page; copyrighted ones list the character and the source.
        </p>

        {related.length > 0 ? (
          <p className="mt-8 text-muted-foreground">
            Related:{" "}
            {related.map((r, i) => (
              <span key={r.slug}>
                {i > 0 ? " · " : ""}
                <Link href={`/monologues/${r.slug}`} className="text-foreground font-medium underline hover:no-underline">
                  {r.title.toLowerCase()}
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        <div className="mt-12">
          <GhostLightInlineCta />
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2">Not the one yet?</h2>
          <p className="text-muted-foreground mb-6">
            Describe the piece the way you would to a coach and the search reads the whole corpus, not this
            shelf. Free to start, no credit card.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href={searchHref}>Search the corpus</Link>
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
