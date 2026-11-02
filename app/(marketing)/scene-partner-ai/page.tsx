import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Scene Partner AI: Rehearse Scenes with an AI Reader",
  description:
    "Rehearse scenes with AI that reads the other lines out loud. Run sides, film and TV scenes, and monologues before your audition. Free to try.",
  openGraph: {
    title: "Scene Partner AI | ActorRise",
    description:
      "Rehearse scenes with AI that reads the other lines. Run sides, film & TV scenes, and monologues. Free to try.",
    url: `${siteUrl}/scene-partner-ai`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Scene Partner AI | ActorRise",
    description:
      "Rehearse scenes with AI that reads the other lines. Run sides, film & TV scenes, and monologues. Free to try.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/scene-partner-ai` },
};

// Matches the visible FAQ below (Google requires schema to reflect on-page content).
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How does ScenePartner AI work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pick a scene or monologue, choose which character you want to play, and hit start. ScenePartner reads the other lines out loud using text-to-speech. It listens for your cue lines and advances automatically, so you can rehearse hands-free.",
      },
    },
    {
      "@type": "Question",
      name: "Is ScenePartner free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The free tier includes limited ScenePartner sessions. For unlimited rehearsal, check the pricing page.",
      },
    },
    {
      "@type": "Question",
      name: "Can I use my own sides or scripts?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can paste or upload your own audition sides and rehearse them with ScenePartner. It works with any text, not just material from the ActorRise database.",
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.scenePartner" />}
        title={
          <SeoT k="seoScenePartner.title" slots={{ em: <em className="italic text-primary"><T k="seoScenePartner.titleEm" /></em> }} />
        }
        lede={<T k="seoScenePartner.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoScenePartner.b1" slots={{ strong: <strong className="text-foreground"><T k="seoScenePartner.b1Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoScenePartner.b2" slots={{ strong: <strong className="text-foreground"><T k="seoScenePartner.b2Strong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">&middot;</span>
          <span>
            <SeoT k="seoScenePartner.b3" slots={{ strong: <strong className="text-foreground"><T k="seoScenePartner.b3Strong" /></strong> }} />
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/audition-ai"><T k="seoScenePartner.learnMore" /></Link>
        </Button>
      </div>

      <div className="mt-12 space-y-3 text-sm text-muted-foreground">
        <p>
          <SeoT
            k="seoScenePartner.need"
            slots={{
              finder: (
                <Link prefetch={false} href="/monologue-finder" className="text-foreground underline hover:no-underline">
                  <T k="seoCommon.links.finder" />
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
              <T k="seoScenePartner.q1" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoScenePartner.a1" />
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-2">
              <T k="seoScenePartner.q2" />
            </h3>
            <p className="text-muted-foreground">
              <SeoT
                k="seoScenePartner.a2"
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
              <T k="seoScenePartner.q3" />
            </h3>
            <p className="text-muted-foreground">
              <T k="seoScenePartner.a3" />
            </p>
          </div>
        </div>
      </section>
      </div>
    </>
  );
}
