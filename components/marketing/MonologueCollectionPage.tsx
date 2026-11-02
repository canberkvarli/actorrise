import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GhostLightInlineCta } from "@/components/marketing/GhostLightInlineCta";
import { StageHero } from "@/components/marketing/StageHero";
import { COLLECTIONS, type Collection } from "@/lib/monologueCollections";
import { monologueSlug, type CollectionMonologue } from "@/lib/monologueSeo";
import { displayableAuthor } from "@/lib/utils";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T, type MessageKey } from "@/lib/i18n";
import { ContentT } from "@/components/seo/ContentT";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

function readableLength(seconds: number | null): string | null {
  if (!seconds) return null;
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return mm > 0 ? `${mm}:${ss.toString().padStart(2, "0")}` : `0:${ss.toString().padStart(2, "0")}`;
}

function sourceWord(sourceType: string): MessageKey {
  if (sourceType === "film") return "seoCollection.film";
  if (sourceType === "tv") return "seoCollection.tv";
  return "seoCollection.play";
}

/**
 * One keyword collection: the hero, the actual list, related shelves, and the
 * same rehearse card the monologue pages end on. Server component; the list
 * is fetched by the [slug] route and handed in.
 */
export function MonologueCollectionPage({ collection, monologues }: { collection: Collection; monologues: CollectionMonologue[] }) {
  const searchHref = `/monologues?q=${encodeURIComponent(collection.query)}`;
  const turnOf = new Map((collection.picks ?? []).map((p) => [p.id, p.turn]));
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
        direction={<ContentT k={`contentCollections.${collection.slug}.direction`} fallback={collection.direction} />}
        title={
          <ContentT
            k={`contentCollections.${collection.slug}.h1`}
            fallback={
              <>
                <em className="italic text-primary">{collection.h1.em}</em> {collection.h1.rest}
              </>
            }
            slots={{
              em: (
                <em className="italic text-primary">
                  <ContentT k={`contentCollections.${collection.slug}.em`} fallback={collection.h1.em} />
                </em>
              ),
            }}
          />
        }
        lede={<ContentT k={`contentCollections.${collection.slug}.intro`} fallback={collection.intro} />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href={searchHref}><T k="seoCollection.searchAll" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-3xl">
        {monologues.length === 0 ? (
          <p className="text-muted-foreground mb-10">
            <SeoT
              k="seoCollection.nothing"
              slots={{
                link: (
                  <Link href={searchHref} className="text-foreground font-medium underline hover:no-underline">
                    <T k="seoCommon.trySearch" />
                  </Link>
                ),
              }}
            />
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {monologues.map((m, i) => {
              const href = `/monologues/${monologueSlug(m)}`;
              const author = displayableAuthor(m.author);
              const len = readableLength(m.durationSeconds);
              const turn = turnOf.get(m.id);
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
                            <span className="text-muted-foreground font-normal">
                              <T k="seoCollection.fromPlay" vars={{ play: m.playTitle }} />
                            </span>
                          ) : null}
                        </Link>
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[
                          author,
                          <T key="source" k={sourceWord(m.sourceType)} />,
                          m.tone,
                          len ? <T key="len" k="seoCollection.lenMin" vars={{ len }} /> : null,
                        ]
                          .filter(Boolean)
                          .map((part, j) => (
                            <span key={j}>
                              {j > 0 ? "  ·  " : null}
                              {part}
                            </span>
                          ))}
                      </p>
                      {turn ? (
                        <p className="mt-2 text-sm italic leading-relaxed text-foreground">
                          <ContentT
                            k={`contentCollections.${collection.slug}.picks.${m.id}` as MessageKey}
                            fallback={turn}
                          />
                        </p>
                      ) : null}
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
          <T k="seoCollection.lengthNote" />
        </p>

        {related.length > 0 ? (
          <p className="mt-8 text-muted-foreground">
            <T k="seoCommon.related" />
            {related.map((r, i) => (
              <span key={r.slug}>
                {i > 0 ? " · " : ""}
                <Link href={`/monologues/${r.slug}`} className="text-foreground font-medium underline hover:no-underline">
                  <ContentT k={`contentCollections.${r.slug}.title`} fallback={r.title} lower />
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        <div className="mt-12">
          <GhostLightInlineCta />
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-2"><T k="seoCollection.notYet" /></h2>
          <p className="text-muted-foreground mb-6">
            <T k="seoCollection.notYetBody" />
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="rounded-full px-6">
              <Link href={searchHref}><T k="seoCollection.searchCorpus" /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full px-6">
              <Link href="/signup"><T k="cta.startRehearsing" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
