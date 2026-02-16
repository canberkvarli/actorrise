import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Find the right monologue in less than 20 seconds. Free tier to try, Plus and Unlimited for serious actors. AI search, bookmarks, and more. No credit card for free.",
  openGraph: {
    title: "Pricing | ActorRise - Find the Right Monologue in 20 Seconds",
    description:
      "Find the right monologue in less than 20 seconds. Free tier, Plus, and Unlimited. AI search. Start free.",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
