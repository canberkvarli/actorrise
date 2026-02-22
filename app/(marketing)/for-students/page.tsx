import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ForStudentsDiscountCTA } from "@/components/landing/ForStudentsDiscountCTA";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Students & educators",
  description:
    "Discounts for students, teachers, and coaches. Request a code and we'll email you.",
  openGraph: {
    title: "Students & educators | ActorRise",
    description:
      "Discounts for students, teachers, and coaches. Request a code and we'll email you.",
    url: `${siteUrl}/for-students`,
  },
  alternates: { canonical: `${siteUrl}/for-students` },
};

export default function ForStudentsPage() {
  return (
    <div className="container mx-auto px-6 py-16 md:py-24 max-w-2xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
        Students & educators
      </h1>
      <p className="text-lg text-muted-foreground mb-8">
        I offer discounts because I've been there. Training's expensive and every bit helps.
        Students get a lower rate; teachers, schools, and acting coaches get a discounted rate too.
        Request a code and we'll review and email you. No codes are shown on the site; you'll get yours by email after approval.
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
