import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ActorRise plans: free tier to explore 8,600+ monologues, Plus and Unlimited for serious actors. AI search, bookmarks, and more. No credit card for free.",
  openGraph: {
    title: "Pricing | ActorRise - AI Monologue Search",
    description:
      "Free tier, Plus, and Unlimited plans. 8,600+ monologues, AI semantic search. Start free.",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
