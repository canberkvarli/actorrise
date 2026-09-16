import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

/* This page advertised a DISCOUNT (students a lower rate, educators a
   discounted rate, both behind a request-a-code flow). That offer is retired:
   educators and students get Plus free, granted by hand, and students come in
   through their teacher rather than signing up for it themselves. The page had
   been quoting the old terms to the public long after they stopped being true. */

export const metadata: Metadata = {
  title: "Free ActorRise for Students & Drama Educators",
  description:
    "Educators and their students get Plus free. Sign up, email me the address you used, and I'll switch it on.",
  openGraph: {
    title: "Free ActorRise for Students & Drama Educators | ActorRise",
    description:
      "Educators and their students get Plus free. No discount code, no forms. Just email me.",
    url: `${siteUrl}/for-students`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Free ActorRise for Students & Drama Educators | ActorRise",
    description:
      "Educators and their students get Plus free. No discount code, no forms. Just email me.",
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
          There&rsquo;s no discount to apply for, because there&rsquo;s no
          discount. Teachers, coaches and their students get Plus free, and I
          turn it on by hand.
        </p>

        <div className="mb-10 space-y-6">
          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              If you teach
            </h2>
            <p className="text-muted-foreground">
              Sign up free, then email me at{" "}
              <a
                href="mailto:canberk@actorrise.com"
                className="font-medium text-foreground underline hover:no-underline"
              >
                canberk@actorrise.com
              </a>{" "}
              with the address you used and I&rsquo;ll open Plus on your
              account. A month to start, and if you want longer just say so.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              If you&rsquo;re a student
            </h2>
            <p className="text-muted-foreground">
              Ask your teacher to send me the class list. They email me the
              addresses, I open Plus for all of you at once, and your dates line
              up instead of scattering. Start free in the meantime, no card
              needed.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button asChild size="lg" className="rounded-full px-6">
            <Link href="/signup">Start free</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="rounded-full px-6">
            <Link href="/">Try the search</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
