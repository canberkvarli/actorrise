import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

/* Students come in through their teacher's class link (2026-10-16) and get Plus
   for a month without paying; a school keeps the class on with a class plan
   (/for-teachers, 2026-10-29). Before that this page described the class list
   emailed to Canberk, and before that a discount code; both are gone. Students
   are 13 and up (privacy policy, section 11). */

export const metadata: Metadata = {
  title: "Free ActorRise for Students & Drama Educators",
  description:
    "Students get Plus free through their teacher's class link. Teachers make the link themselves in a minute.",
  openGraph: {
    title: "Free ActorRise for Students & Drama Educators | ActorRise",
    description:
      "Students get Plus free through their teacher's class link. No discount code, no card.",
    url: `${siteUrl}/for-students`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Free ActorRise for Students & Drama Educators | ActorRise",
    description:
      "Students get Plus free through their teacher's class link. No discount code, no card.",
    images: ["/opengraph-image"],
  },
  alternates: { canonical: `${siteUrl}/for-students` },
};

export default function ForStudentsPage() {
  return (
    <>
      <StageHero
        direction="(the student rush.)"
        title={
          <>
            Students & <em className="italic text-primary">educators</em>.
          </>
        }
        lede="You don't pay. I've been there, training costs enough already."
      />

      <div className="container mx-auto max-w-2xl px-6 py-12 md:py-16">
        <p className="mb-8 text-lg text-muted-foreground">
          There&rsquo;s no discount to apply for, because students don&rsquo;t
          pay. You get Plus through your teacher&rsquo;s class link, and your
          school takes care of the rest.
        </p>

        <div className="mb-10 space-y-6">
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              If you teach
            </h2>
            <p className="text-muted-foreground">
              Sign up free, pick Teacher, and make your class link from the
              library. Everyone who signs up through it gets Plus for a month.
              How it works, and the class plans that keep a class on after
              that, are on the{" "}
              <Link prefetch={false} href="/for-teachers" className="font-medium text-foreground underline hover:no-underline">
                page for teachers
              </Link>
              .
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              If you&rsquo;re a student
            </h2>
            <p className="text-muted-foreground">
              Ask your teacher to make a class link; it takes them a minute.
              Sign up through it and you get Plus for a month, free, with no
              card. It works best when the whole class signs up together in
              class. For students 13 and up.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/signup">Start free</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link prefetch={false} href="/">Try the search</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
