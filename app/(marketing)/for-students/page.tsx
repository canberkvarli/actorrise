import type { Metadata } from "next";
import { ForStudentsContent } from "./ForStudentsContent";

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
  return <ForStudentsContent />;
}
