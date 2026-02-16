import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dramatic Monologue from Contemporary Play",
  description:
    "Find dramatic monologues from contemporary plays in 8,600+ searchable pieces. AI search by era, tone, and length. Free to try.",
  openGraph: {
    title: "Dramatic Monologue from Contemporary Play | ActorRise",
    description:
      "Search 8,600+ monologues for dramatic pieces from contemporary plays. AI-powered discovery.",
  },
};

const SEARCH_QUERY = "dramatic monologue contemporary play";

export default function Page() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Dramatic monologue from a contemporary play
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Looking for something serious, modern, and not overdone? We have thousands of dramatic
        monologues from contemporary plays. Search by emotion, relationship, or length—no keyword
        guessing.
      </p>
      <Button asChild size="lg" className="rounded-full px-6">
        <Link href={`/search?q=${encodeURIComponent(SEARCH_QUERY)}`}>
          Search 8,600+ monologues
        </Link>
      </Button>
    </div>
  );
}
