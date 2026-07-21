import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Classical Monologues for Auditions",
  description:
    "Find classical monologues from Shakespeare and beyond. 12,000+ searchable pieces with AI. Filter by play, length, and character type.",
  openGraph: {
    title: "Classical Monologues for Auditions | ActorRise",
    description:
      "Search 12,000+ monologues for classical pieces. Shakespeare and more. AI-powered discovery.",
    url: `${siteUrl}/monologues/classical-monologues`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Classical Monologues for Auditions | ActorRise",
    description:
      "Search 12,000+ monologues for classical pieces. Shakespeare and more. AI-powered discovery.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/monologues/classical-monologues` },
};

const SEARCH_QUERY = "classical monologue Shakespeare";

export default function Page() {
  return (
    <StageHero
      direction="(the classics.)"
      title={
        <>
          <em className="italic text-primary">Classical</em> monologues for auditions
        </>
      }
      lede={
        <>
          From Shakespeare to other classic texts. Search by play, character type, or mood. Our
          database includes thousands of classical pieces, and the AI understands what you mean, not
          just the words you type.
        </>
      }
    >
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 12,000+ monologues
        </Link>
      </Button>
    </StageHero>
  );
}
