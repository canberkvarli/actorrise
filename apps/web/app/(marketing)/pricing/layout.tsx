import type { Metadata } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Find the right monologue in seconds. Free tier to try, Plus and Unlimited for serious actors. AI search, bookmarks, and more. No credit card for free.",
  openGraph: {
    title: "Pricing | ActorRise - Find the Right Monologue in Seconds",
    description:
      "Find the right monologue in seconds. Free tier, Plus, and Unlimited. AI search. Start free.",
    url: `${siteUrl}/pricing`,
  },
  alternates: { canonical: `${siteUrl}/pricing` },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
