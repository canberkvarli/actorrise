import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "AI Rehearsal Tool for Actors: Practice Scenes & Monologues",
  description:
    "An AI rehearsal tool that reads the other lines so you can practice scenes and monologues before auditions. 19,000+ pieces. Free to try.",
  openGraph: {
    title: "AI Rehearsal Tool for Actors | ActorRise",
    description:
      "Practice scenes and monologues with AI that reads the other lines. 19,000+ monologues from plays, films, and TV. Free to try.",
    url: `${siteUrl}/ai-rehearsal-tool`,
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Rehearsal Tool for Actors | ActorRise",
    description:
      "Practice scenes and monologues with AI that reads the other lines. 19,000+ monologues from plays, films, and TV. Free to try.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/ai-rehearsal-tool` },
};

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.rehearsal" />}
        title={
          <SeoT k="seoRehearsal.title" slots={{ em: <em className="italic text-primary"><T k="seoRehearsal.titleEm" /></em> }} />
        }
        lede={<T k="seoRehearsal.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoRehearsal.b1" slots={{ strong: <strong className="text-foreground"><T k="seoRehearsal.b1Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoRehearsal.b2" slots={{ strong: <strong className="text-foreground"><T k="seoRehearsal.b2Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoRehearsal.b3" slots={{ strong: <strong className="text-foreground"><T k="seoRehearsal.b3Strong" /></strong> }} />
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/scene-partner-ai"><T k="seoRehearsal.learnSp" /></Link>
        </Button>
      </div>

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoRehearsal.looking"
            slots={{
              finder: (
                <Link prefetch={false} href="/monologue-finder" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.finder" />
                </Link>
              ),
              audition: (
                <Link prefetch={false} href="/audition-monologues" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.audition" />
                </Link>
              ),
              women: (
                <Link prefetch={false} href="/monologues-for-women" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.women" />
                </Link>
              ),
              men: (
                <Link prefetch={false} href="/monologues-for-men" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.men" />
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
              <T k="seoRehearsal.q1" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoRehearsal.a1"
                slots={{
                  pricing: (
                <Link prefetch={false} href="/pricing" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.pricing" />
                </Link>
              ),
                }}
              />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoRehearsal.q2" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoRehearsal.a2" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoRehearsal.q3" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoRehearsal.a3" />
            </p>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
