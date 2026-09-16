import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Monologues for Drama Teachers & Acting Coaches",
  description:
    "Your students find the right audition monologue in seconds. 19,000+ pieces, AI search, Overdone filter. A free resource for drama teachers.",
  openGraph: {
    title: "Monologues for Drama Teachers & Acting Coaches | ActorRise",
    description:
      "Find the right audition monologue in seconds. 19,000+ pieces, AI fit to type and casting, Overdone filter. Plus is free for teachers, coaches and their students.",
    url: `${siteUrl}/for-teachers`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Drama Teachers & Acting Coaches | ActorRise",
    description:
      "Find the right audition monologue in seconds. 19,000+ pieces, AI fit to type and casting, Overdone filter. Plus is free for teachers, coaches and their students.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/for-teachers` },
};

export default function ForTeachersPage() {
  return (
    <>
      <StageHero
        direction="(notes for the faculty.)"
        title={
          <>
            For <em className="italic text-primary">teachers</em> & coaches.
          </>
        }
        lede="Your students find the right audition monologue in seconds, so they spend less time digging and more time rehearsing."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <p className="text-lg text-muted-foreground mb-8">
        ActorRise gives them 19,000+ searchable pieces, AI that matches to their type and the
        casting scenario, and an Overdone filter so they bring something different.
      </p>
      <ul className="space-y-3 text-muted-foreground mb-10">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>One of the largest searchable monologue databases (19,000+ pieces)</span>
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
        I’m starting with teachers and coaches: point your students to the platform and they get
        better material that spreads by word of mouth. Curated lists and class-specific features are
        on the roadmap.
      </p>
      {/* This said "need a discount code for your studio?" and pointed at the
          contact form. There is no code and no form: the offer is free Plus,
          granted by hand, and the class list is how students get it. */}
      <p className="text-muted-foreground mb-8">
        You don’t pay for this, and neither do your students. Sign up, email me at{" "}
        <a
          href="mailto:canberk@actorrise.com"
          className="text-foreground font-medium underline hover:no-underline"
        >
          canberk@actorrise.com
        </a>{" "}
        with the address you used, and I’ll open Plus on your account. A month to start, and
        longer for the asking. Send your students’ addresses along and I’ll do the same for
        them, all on the same dates.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link href="/signup">Start rehearsing</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Explore the search</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
