import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ForStudentsDiscountCTA } from "@/components/landing/ForStudentsDiscountCTA";
import { StageHero } from "@/components/marketing/StageHero";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Student & Educator Discounts for Actors",
  description:
    "Discounts for students, teachers, and coaches. Request a code and we'll email you.",
  openGraph: {
    title: "Student & Educator Discounts for Actors | ActorRise",
    description:
      "Discounts for students, teachers, and coaches. Request a code and we'll email you.",
    url: `${siteUrl}/for-students`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Student & Educator Discounts for Actors | ActorRise",
    description:
      "Discounts for students, teachers, and coaches. Request a code and we'll email you.",
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
        lede="I offer discounts because I've been there. Training's expensive and every bit helps."
      />

      <div className="container mx-auto px-6 py-12 md:py-16 max-w-2xl">
      <p className="text-lg text-muted-foreground mb-8">
        Students get a lower rate; teachers, schools, and acting coaches get a discounted rate too.
        Request a code and I'll review and email you. No codes are shown on the site; you'll get yours by email after approval.
      </p>
      <div className="flex flex-wrap gap-4">
        <ForStudentsDiscountCTA />
        <Button asChild variant="outline" size="lg" className="rounded-full px-6">
          <Link href="/">Try the search</Link>
        </Button>
      </div>
      </div>
    </>
  );
}
