import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";
import { VideoSchema } from "@/components/seo/VideoSchema";
import { GuideVideoCard } from "@/components/guides/GuideVideoCard";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { ContentT } from "@/components/seo/ContentT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Guides & Tutorials for Actors",
  description:
    "Short video guides on getting the most out of ActorRise: finding the right monologue, rehearsing with ScenePartner, and prepping for auditions.",
  openGraph: {
    title: "ActorRise Guides & Tutorials",
    description:
      "Short video guides on finding monologues, rehearsing with ScenePartner, and prepping for auditions.",
    url: `${siteUrl}/guides`,
  },
  twitter: {
    card: "summary_large_image",
    title: "ActorRise Guides & Tutorials",
    description:
      "Short video guides on finding monologues, rehearsing with ScenePartner, and prepping for auditions.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/guides` },
};

// Add a new guide by dropping an entry here. youtubeId is the part after `v=`.
// uploadDate (ISO 8601) and duration (ISO 8601, e.g. PT1M30S) feed VideoObject
// schema so Google can index each as a video result.
type Guide = {
  youtubeId: string;
  title: string;
  description: string;
  uploadDate: string;
  duration?: string;
};

const GUIDES: Guide[] = [
  {
    youtubeId: "TTZxo3bZPI4",
    title: "How ScenePartner works",
    description:
      "A quick look at rehearsing a scene with ScenePartner reading the other lines, so you can run material out loud anytime, without booking a partner.",
    // TODO(Canberk): set to the real YouTube publish date.
    uploadDate: "2026-03-01",
    duration: "PT1M30S",
  },
];

export default function GuidesPage() {
  return (
    <>
      <StageHero
        direction={<T k="contentGuides.direction" />}
        title={
          <SeoT
            k="contentGuides.title"
            slots={{ em: <em className="italic text-primary"><T k="contentGuides.titleEm" /></em> }}
          />
        }
        lede={<T k="contentGuides.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <div className="space-y-16">
        {GUIDES.map((guide) => (
          <section key={guide.youtubeId} aria-label={guide.title}>
            <VideoSchema
              name={guide.title}
              description={guide.description}
              thumbnailUrl={`https://img.youtube.com/vi/${guide.youtubeId}/maxresdefault.jpg`}
              uploadDate={guide.uploadDate}
              embedUrl={`https://www.youtube.com/embed/${guide.youtubeId}`}
              duration={guide.duration}
            />
            <h2 className="text-2xl font-semibold tracking-tight text-foreground mb-4">
              <ContentT k={`contentGuides.videos.${guide.youtubeId}.title`} fallback={guide.title} />
            </h2>
            <GuideVideoCard youtubeId={guide.youtubeId} title={guide.title} />
            <p className="text-muted-foreground mt-4">
              <ContentT k={`contentGuides.videos.${guide.youtubeId}.description`} fallback={guide.description} />
            </p>
          </section>
        ))}
      </div>

      <div className="mt-16 pt-12 border-t border-border/60">
        <p className="text-muted-foreground mb-6">
          <SeoT
            k="contentGuides.tryIt"
            slots={{
              finder: (
                <Link prefetch={false} href="/monologue-finder" className="text-foreground font-medium underline hover:no-underline">
                  <T k="contentGuides.finderLink" />
                </Link>
              ),
              partner: (
                <Link prefetch={false} href="/scene-partner-ai" className="text-foreground font-medium underline hover:no-underline">
                  ScenePartner
                </Link>
              ),
            }}
          />
        </p>
        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup"><T k="cta.startRehearsing" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/"><T k="seoCommon.trySearch" /></Link>
          </Button>
        </div>
      </div>
      </div>
    </>
  );
}
