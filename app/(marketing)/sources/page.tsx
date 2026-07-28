import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Sources & Copyright",
  description:
    "Every piece on ActorRise links back to its source and original publication. We never host full scripts of copyrighted works.",
  openGraph: {
    title: "Sources & Copyright | ActorRise",
    description:
      "Every piece links back to its source and original publication. We never host full scripts of copyrighted works.",
    url: `${siteUrl}/sources`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Sources & Copyright | ActorRise",
    description:
      "Every piece links back to its source and original publication. We never host full scripts of copyrighted works.",
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
            ActorRise is a search and discovery tool for monologues. Every piece links back to its
            source and original publication, and we never host the full script of a copyrighted
            work.
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

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Full scripts</h2>
      <p className="text-muted-foreground mb-6">
        We never host or distribute the full script of any copyrighted play, film, or show. For
        works still under copyright, we point you to the publisher or a licensed source to obtain
        the complete script, and every piece we surface carries attribution and a link back to
        where it comes from.
      </p>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Content removal</h2>
      <p className="text-muted-foreground mb-6">
        If you are a rights holder (or represent one) and would like something removed or
        corrected, email{" "}
        <a
          href="mailto:canberk@actorrise.com"
          className="text-foreground underline hover:no-underline"
        >
          canberk@actorrise.com
        </a>{" "}
        with a link to the piece. Requests are honored promptly, usually within a day.
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
