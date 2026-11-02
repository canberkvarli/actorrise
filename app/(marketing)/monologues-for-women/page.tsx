import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Women: Comedic, Dramatic, Classical & Contemporary",
  description:
    "Monologues for women from 19,000+ real pieces. Comedic, dramatic, classical, contemporary. AI search by tone, length, age range, and type. Free to try.",
  openGraph: {
    title: "Monologues for Women | ActorRise",
    description:
      "Search 19,000+ monologues for women. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    url: `${siteUrl}/monologues-for-women`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Women | ActorRise",
    description:
      "Search 19,000+ monologues for women. Comedic, dramatic, classical, contemporary. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues-for-women` },
};

const SEARCH_QUERY = "monologue for woman";

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.women" />}
        title={
          <SeoT k="seoWomen.title" slots={{ em: <em className="italic text-primary"><T k="seoWomen.titleEm" /></em> }} />
        }
        lede={<T k="seoWomen.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            <T k="seoWomen.searchBtn" />
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoWomen.also"
            slots={{
              comedic: (
                <Link prefetch={false} href="/monologues/comedic-woman-under-2-minutes" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.comedicWomenUnder2" />
                </Link>
              ),
              dramatic: (
                <Link prefetch={false} href="/dramatic-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.dramatic" />
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
              <T k="seoWomen.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoWomen.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoWomen.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoWomen.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoWomen.q3" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoWomen.a3"
                slots={{
                  link: (
                    <Link prefetch={false} href="/scene-partner-ai" className="text-foreground underline hover:no-underline">
                      ScenePartner AI
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
