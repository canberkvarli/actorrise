import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Sources & Copyright",
  description:
    "ActorRise monologues come from public domain and licensed sources including Project Gutenberg. We do not distribute copyrighted play text.",
  openGraph: {
    title: "Sources & Copyright | ActorRise",
    description:
      "Our content is from public domain and licensed sources. We don't distribute copyrighted play text.",
    url: `${siteUrl}/sources`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Sources & Copyright | ActorRise",
    description:
      "Our content is from public domain and licensed sources. We don't distribute copyrighted play text.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/sources` },
};

export default function SourcesPage() {
  return (
    <>
      <StageHero
        direction="(the source texts.)"
        title={
          <>
            Sources &amp; <em className="italic text-primary">copyright</em>.
          </>
        }
        lede={
          <>
            ActorRise is a search and discovery tool for monologues. We do not sell or distribute
            copyrighted play text. All full text we host comes from legal, traceable sources.
          </>
        }
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Where our content comes from</h2>
      <ul className="space-y-3 text-muted-foreground mb-6">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Project Gutenberg</strong>: Public domain plays
            (e.g. Shakespeare, Chekhov, Ibsen, Wilde) and public-domain play anthologies. Each
            monologue links back to the source on Gutenberg when available.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Other public domain & licensed sources</strong>:
            We may include works that are clearly public domain or explicitly licensed (e.g.
            Creative Commons) with attribution and source links.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Film &amp; TV reference</strong>: We offer
            metadata-only reference entries (character, source title, thematic descriptions, and
            links to scripts and clips). We do not host any film or television script text; links
            point to third-party sites (e.g. IMSDB) for your convenience. ActorRise is not
            responsible for third-party content.
          </span>
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">What we don’t do</h2>
      <p className="text-muted-foreground mb-6">
        We do not host or distribute the full text of copyrighted plays. For material still under
        copyright, we would only provide discovery (e.g. title, author, where to buy) and point
        you to publishers or licensed sources to obtain the script.
      </p>

      <p className="text-sm text-muted-foreground/90">
        If you have questions about a specific source or copyright, please{" "}
        <Link href="/contact" className="text-foreground underline hover:no-underline">
          contact us
        </Link>
        .
      </p>
      </div>
    </>
  );
}
