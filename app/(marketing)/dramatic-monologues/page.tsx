import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Dramatic Monologues for Auditions",
  description:
    "Dramatic monologues for auditions from 19,000+ real pieces. Serious, emotional, high-stakes. AI search by tone, length, and character type.",
  openGraph: {
    title: "Dramatic Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for dramatic, emotional pieces. AI-powered discovery by tone, length, and character.",
    url: `${siteUrl}/dramatic-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Dramatic Monologues for Auditions | ActorRise",
    description:
      "Search 19,000+ monologues for dramatic, emotional pieces. AI-powered discovery by tone, length, and character.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/dramatic-monologues` },
};

const SEARCH_QUERY = "dramatic monologue for audition";

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.dramatic" />}
        title={
          <SeoT k="seoDramatic.title" slots={{ em: <em className="italic text-primary"><T k="seoDramatic.titleEm" /></em> }} />
        }
        lede={<T k="seoDramatic.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            <T k="seoDramatic.searchBtn" />
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoDramatic.also"
            slots={{
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
              women: (
                <Link prefetch={false} href="/monologues-for-women" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.women" />
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
              <T k="seoDramatic.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoDramatic.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoDramatic.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoDramatic.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoDramatic.q3" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoDramatic.a3"
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
