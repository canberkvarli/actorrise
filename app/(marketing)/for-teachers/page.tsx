import type { Metadata } from "next";
import { ForTeachersContent } from "./ForTeachersContent";

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
  return <ForTeachersContent />;
}
