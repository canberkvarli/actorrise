import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Find the right monologue in seconds. Free to start, then Solo, Plus, or Pro when you need more. AI search, bookmarks, and AI rehearsal.",
  openGraph: {
    title: "Pricing | ActorRise - Find the Right Monologue in Seconds",
    description:
      "Find the right monologue in seconds. Free, Solo, Plus, and Pro. AI search. Start free.",
    url: `${siteUrl}/pricing`,
  },
  alternates: { canonical: `${siteUrl}/pricing` },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
