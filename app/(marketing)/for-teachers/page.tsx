import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "For Teachers & Coaches",
  description:
    "Your students find the right audition monologue in less than 20 seconds. 8,600+ monologues, AI search, Overdone filter. Free resource for drama teachers and acting coaches.",
  openGraph: {
    title: "For Teachers & Coaches | ActorRise",
    description:
      "Find the right audition monologue in less than 20 seconds. 8,600+ pieces, AI fit to type and casting, Overdone filter. We're starting with teachers and coaches; students spread it.",
  },
};

export default function ForTeachersPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        For teachers & coaches
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        Your students find the right audition monologue in less than 20 seconds. ActorRise gives them
        8,600+ searchable pieces, AI that matches to their type and the casting scenario, and an
        Overdone filter so they bring something different. So they spend less time digging and more
        time rehearsing.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Largest searchable monologue database (4-8× bigger than Backstage)</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Natural-language search: e.g. “comedic woman under 2 minutes”</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so casting directors get something different</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Free tier so students can try it without a credit card</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        We’re starting with teachers and coaches: point your students to the platform and they get
        better material that spreads by word of mouth. Curated lists and class-specific features are
        on the roadmap.
      </p>
      <p className="text-muted-foreground mb-8">
        Need a discount code for your studio or class? ActorRise is open for partnership too—just{" "}
        <Link href="/contact" className="text-foreground font-medium underline hover:no-underline">
          reach out
        </Link>
        . Happy to help.
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
