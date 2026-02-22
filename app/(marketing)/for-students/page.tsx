import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ForStudentsDiscountCTA } from "@/components/landing/ForStudentsDiscountCTA";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "For Students",
  description:
    "Student discount on ActorRise. Find the right audition monologue in less than 20 seconds. 8,600+ monologues, AI search. Request a code.",
  openGraph: {
    title: "For Students | ActorRise",
    description:
      "Student discount on ActorRise. 8,600+ monologues, AI search, Overdone filter. Request a code and we'll email you.",
    url: `${siteUrl}/for-students`,
  },
  alternates: { canonical: `${siteUrl}/for-students` },
};

export default function ForStudentsPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        For students
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        ActorRise is built for actors and drama students. Search 8,600+ monologues by what you
        need (e.g. “comedic woman under 2 minutes”), get AI that understands type and casting,
        and use the Overdone filter so you bring something different to the room.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Natural-language search: describe the piece you need</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Overdone filter so you don’t show up with the same monologue as everyone else</span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>Free tier to try it; no credit card required</span>
        </li>
      </ul>
      <p className="text-muted-foreground mb-8">
        We offer a student discount. Reach out and we’ll review your request and email you a
        code. No codes are shown on the site; you’ll get yours by email after approval.
      </p>
      <div className="flex flex-wrap gap-4">
        <ForStudentsDiscountCTA />
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the search</Link>
        </Button>
      </div>
    </div>
  );
}
