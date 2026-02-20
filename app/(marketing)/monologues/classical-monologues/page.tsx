import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Classical Monologues for Auditions",
  description:
    "Find classical monologues from Shakespeare and beyond. 8,600+ searchable pieces with AI. Filter by play, length, and character type.",
  openGraph: {
    title: "Classical Monologues for Auditions | ActorRise",
    description:
      "Search 8,600+ monologues for classical pieces. Shakespeare and more. AI-powered discovery.",
    url: `${siteUrl}/monologues/classical-monologues`,
  },
  alternates: { canonical: `${siteUrl}/monologues/classical-monologues` },
};

const SEARCH_QUERY = "classical monologue Shakespeare";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Classical monologues for auditions
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        From Shakespeare to other classic texts. Search by play, character type, or mood. Our
        database includes thousands of classical pieces, and the AI understands what you mean, not
        just the words you type.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 8,600+ monologues
        </Link>
      </Button>
    </div>
  );
}
