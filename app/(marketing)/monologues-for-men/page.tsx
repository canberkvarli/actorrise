import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Men: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Monologues for men from 19,000+ real pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and type. Free to try.",
  openGraph: {
    title: "Monologues for Men | ActorRise",
    description:
      "Search 19,000+ monologues for men. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    url: `${siteUrl}/monologues-for-men`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Men | ActorRise",
    description:
      "Search 19,000+ monologues for men. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues-for-men` },
};

const SEARCH_QUERY = "monologue for man";

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.men" />}
        title={
          <SeoT k="seoMen.title" slots={{ em: <em className="italic text-primary"><T k="seoMen.titleEm" /></em> }} />
        }
        lede={<T k="seoMen.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            <T k="seoMen.searchBtn" />
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoMen.also"
            slots={{
              dramatic: (
                <Link prefetch={false} href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.dramatic" />
                </Link>
              ),
              shakespeare: (
                <Link prefetch={false} href="/shakespeare-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.shakespeare" />
                </Link>
              ),
              contemporary: (
                <Link prefetch={false} href="/contemporary-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.contemporary" />
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
              <T k="seoMen.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoMen.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoMen.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoMen.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoMen.q3" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoMen.a3"
                slots={{
                  link: (
                    <Link prefetch={false} href="/ai-rehearsal-tool" className="text-foreground underline hover:no-underline">
                      <T k="seoMen.a3Link" />
                    </Link>
                  ),
                }}
              />
            </p>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
