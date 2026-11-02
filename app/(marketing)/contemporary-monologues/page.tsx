import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Contemporary Monologues for Auditions",
  description:
    "Contemporary monologues for auditions from 19,000+ real pieces. Modern plays, current voices. AI search by tone, length, and character type.",
  openGraph: {
    title: "Contemporary Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for contemporary pieces from modern plays. AI-powered discovery.",
    url: `${siteUrl}/contemporary-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Contemporary Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for contemporary pieces from modern plays. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/contemporary-monologues` },
};

const SEARCH_QUERY = "contemporary monologue modern play";

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.contemporary" />}
        title={
          <SeoT k="seoContemporary.title" slots={{ em: <em className="italic text-primary"><T k="seoContemporary.titleEm" /></em> }} />
        }
        lede={<T k="seoContemporary.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            <T k="seoContemporary.searchBtn" />
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoContemporary.also"
            slots={{
              dramatic: (
                <Link prefetch={false} href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.dramatic" />
                </Link>
              ),
              men: (
                <Link prefetch={false} href="/monologues-for-men" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.men" />
                </Link>
              ),
              shakespeare: (
                <Link prefetch={false} href="/shakespeare-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.shakespeare" />
                </Link>
              ),
            }}
          />
        </p>
      </div>

      <section className="mt-16 border-t border-border pt-12">
        <h2 className="text-2xl font-bold text-foreground mb-8"><T k="seoCommon.faqTitle" /></h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoContemporary.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoContemporary.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoContemporary.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoContemporary.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoContemporary.q3" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoContemporary.a3" />
            </p>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
