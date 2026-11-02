import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";
import { SeoT } from "@/components/marketing/seo/SeoT";
import { T } from "@/lib/i18n";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Sources & Copyright",
  description:
    "Public domain work in full; anything still in copyright as a short excerpt with attribution and a link back. We never host full scripts of copyrighted works.",
  openGraph: {
    title: "Sources & Copyright | ActorRise",
    description:
      "Public domain work in full; anything in copyright as a short excerpt with attribution. We never host full scripts of copyrighted works.",
    url: `${siteUrl}/sources`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Sources & Copyright | ActorRise",
    description:
      "Public domain work in full; anything in copyright as a short excerpt with attribution. We never host full scripts of copyrighted works.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/sources` },
};

export default function SourcesPage() {
  return (
    <>
      <StageHero
        direction={<T k="seoDirections.sources" />}
        title={
          <SeoT k="seoSources.title" slots={{ em: <em className="italic text-primary"><T k="seoSources.titleEm" /></em> }} />
        }
        lede={<T k="seoSources.lede" />}
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3"><T k="seoSources.whereTitle" /></h2>
      <ul className="space-y-3 text-muted-foreground mb-6">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT k="seoSources.pd" slots={{ strong: <strong className="text-foreground"><T k="seoSources.pdStrong" /></strong> }} />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT
              k="seoSources.cr"
              slots={{
                strong: <strong className="text-foreground"><T k="seoSources.crStrong" /></strong>,
                excerpt: <strong className="text-foreground"><T k="seoSources.crExcerpt" /></strong>,
              }}
            />
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <SeoT k="seoSources.none" slots={{ strong: <strong className="text-foreground"><T k="seoSources.noneStrong" /></strong> }} />
          </span>
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3"><T k="seoSources.fullTitle" /></h2>
      <p className="text-muted-foreground mb-6">
        <T k="seoSources.full" />
      </p>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3"><T k="seoSources.removalTitle" /></h2>
      <p className="text-muted-foreground mb-6">
        <SeoT
          k="seoSources.removal"
          slots={{
            email: (
              <a
                href="mailto:canberk@actorrise.com"
                className="text-foreground underline hover:no-underline"
              >
                canberk@actorrise.com
              </a>
            ),
          }}
        />
      </p>

      <p className="text-sm text-muted-foreground/90">
        <SeoT
          k="seoSources.questions"
          slots={{
            contact: (
                <Link prefetch={false} href="/contact" className="text-foreground underline hover:no-underline">
                  <T k="seoSources.contactLink" />
                </Link>
              ),
          }}
        />
      </p>
      </div>
    </>
  );
}
