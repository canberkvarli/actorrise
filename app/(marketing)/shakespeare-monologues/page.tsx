import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Shakespeare Monologues for Auditions",
  description:
    "Shakespeare monologues for auditions from Hamlet, Macbeth, Midsummer, and more. Filter 19,000+ real pieces by play, length, and character type.",
  openGraph: {
    title: "Shakespeare Monologues for Auditions | ActorRise",
    description:
      "Search Shakespeare monologues by character, play, tone, and length. AI-powered discovery from 19,000+ pieces.",
    url: `${siteUrl}/shakespeare-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Shakespeare Monologues for Auditions | ActorRise",
    description:
      "Search Shakespeare monologues by character, play, tone, and length. AI-powered discovery from 19,000+ pieces.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/shakespeare-monologues` },
};

const SEARCH_QUERY = "Shakespeare monologue for audition";

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.shakespeare" />}
        title={
          <SeoT k="seoShakespeare.title" slots={{ em: <em className="italic text-primary">Shakespeare</em> }} />
        }
        lede={<T k="seoShakespeare.lede" />}
      >
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
            <T k="seoShakespeare.searchBtn" />
          </Link>
        </Button>
      </StageHero>

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="mt-0 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoShakespeare.also"
            slots={{
              classical: (
                <Link prefetch={false} href="/monologues/classical-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.classical" />
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
              <T k="seoShakespeare.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoShakespeare.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoShakespeare.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoShakespeare.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoShakespeare.q3" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoShakespeare.a3"
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
