import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "For Teachers & Coaches",
  description:
    "Point your students to 8,600+ monologues with AI search. Free resource for drama teachers and acting coaches. Curated lists and class use coming soon.",
  openGraph: {
    title: "For Teachers & Coaches | ActorRise",
    description:
      "Free monologue resource for drama teachers and acting coaches. 8,600+ pieces, AI search. Point students to the right material.",
  },
};

export default function ForTeachersPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        For teachers & coaches
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Your students are always hunting for monologues. ActorRise gives them 8,600+ searchable
        pieces and an AI that understands what they need—so they spend less time digging and more
        time rehearsing.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Largest searchable monologue database (4–8× bigger than Backstage)</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Natural-language search: e.g. &ldquo;comedic woman under 2 minutes&rdquo;</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Free tier so students can try it without a credit card</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        Curated lists and class-specific features are on the roadmap. For now, you can point
        students to the platform and they can search by type, length, and style.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Explore the search</Link>
        </Button>
      </div>
    </div>
  );
}
