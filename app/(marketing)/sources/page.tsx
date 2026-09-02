import type { Metadata } from "next";
import Link from "next/link";
import { StageHero } from "@/components/marketing/StageHero";

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
        direction="(the source texts.)"
        title={
          <>
            Sources &amp; <em className="italic text-primary">copyright</em>.
          </>
        }
        lede={
          <>
            ActorRise is a search and discovery tool for monologues. Public domain work is carried
            in full. Anything still in copyright appears only as a short excerpt, one speech, with
            attribution and a link back to the original. We never host the full script of a
            copyrighted work.
          </>
        }
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Where our content comes from</h2>
      <ul className="space-y-3 text-muted-foreground mb-6">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Works in the public domain</strong>: plays whose
            copyright has expired, such as Shakespeare, Ibsen, Chekhov, Molière and Wilde, mostly
            from Project Gutenberg. These are out of copyright, so we carry the speech in full and
            link back to the edition it came from.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Film, television and contemporary plays still in
            copyright</strong>: we carry a <strong className="text-foreground">short excerpt</strong>
            {" "}only, a single character&rsquo;s speech of roughly a hundred and thirty words, taken
            from a screenplay or script tens of thousands of words long. Every excerpt names the
            title, the writer and the character, and links out to buy or read the full work. These
            excerpts are used under fair use, not under a licence from the rights holder, and we do
            not claim any ownership of them.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Works we hold no text for at all</strong>: for some
            titles we list only the play, the character and a link to the publisher, with no text
            on the page. If we have no clear basis to reproduce a passage, we would rather point you
            to it than quote it.
          </span>
        </li>
      </ul>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Full scripts</h2>
      <p className="text-muted-foreground mb-6">
        We never host or distribute the full script of any copyrighted play, film or show, and we
        have no way for anyone to obtain one here. ActorRise is for finding and rehearsing a single
        audition piece. When you want the whole work, we point you at the publisher or a licensed
        seller, which is where it should be bought.
      </p>

      <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">Content removal</h2>
      <p className="text-muted-foreground mb-6">
        If you are a rights holder, or represent one, and would like an excerpt removed or
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
