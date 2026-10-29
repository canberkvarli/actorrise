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
      "Find the right audition monologue in seconds. 19,000+ pieces, AI fit to type and casting, Overdone filter. Your class gets Plus free for a month, then a class plan from $249 a year.",
    url: `${siteUrl}/for-teachers`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Monologues for Drama Teachers & Acting Coaches | ActorRise",
    description:
      "Find the right audition monologue in seconds. 19,000+ pieces, AI fit to type and casting, Overdone filter. Your class gets Plus free for a month, then a class plan from $249 a year.",
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
      <h2 className="mb-3 text-lg font-semibold text-foreground">How your class gets in</h2>
      <ol className="mb-8 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>Sign up free and pick Teacher when it asks who you are.</li>
        <li>
          In the library you&rsquo;ll find your class card. Make your class link there; it takes a
          minute.
        </li>
        <li>
          Have the class sign up together, in one class period. It takes about ten minutes, and
          everyone who joins through your link gets Plus for a month, free.
        </li>
        <li>
          &ldquo;Your class&rdquo; shows you who has joined, who is active and who has run a monologue
          all the way through. You see what they did, never what they searched for.
        </li>
      </ol>
      <p className="mb-8 text-sm text-muted-foreground">
        The student side is for students 13 and up.
      </p>

      <h2 className="mb-3 text-lg font-semibold text-foreground">Keeping your class on</h2>
      <p className="mb-3 text-muted-foreground">
        After the free month, a class plan keeps every student on Plus for the school year, paid by
        the school on one invoice. Purchase orders are fine.
      </p>
      <ul className="mb-8 space-y-2 text-muted-foreground">
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Classroom</strong>, $249 a year: one teacher, up to 40
            students
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">Program</strong>, $499 a year: one school, up to 150
            students
          </span>
        </li>
        <li className="flex gap-2">
          <span className="text-primary">·</span>
          <span>
            <strong className="text-foreground">District or studio</strong>: tell me what you need and
            I&rsquo;ll send a quote
          </span>
        </li>
      </ul>
      <p className="mb-8 text-muted-foreground">
        Your own account is on me. Email me at{" "}
        <a
          href="mailto:canberk@actorrise.com"
          className="text-foreground font-medium underline hover:no-underline"
        >
          canberk@actorrise.com
        </a>{" "}
        with the address you signed up with and I&rsquo;ll switch Plus on. Same address for a quote
        your school can approve.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button asChild size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/signup">Sign up as a teacher</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link prefetch={false} href="/">Explore the search</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
