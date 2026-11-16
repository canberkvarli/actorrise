import type { Metadata } from "next";
import { BRAND, SITE_URL } from "@/lib/brand";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Find the right monologue in seconds. Free to start, then Plus at $8.25 a month billed yearly. Every monologue, unlimited AI search, and AI rehearsal.",
  openGraph: {
    title: `Pricing | ${BRAND.name} - Find the Right Monologue in Seconds`,
    description:
      "Find the right monologue in seconds. Free, Solo, Plus, and Pro. AI search. Start free.",
    url: `${siteUrl}/pricing`,
  },
  alternates: { canonical: `${siteUrl}/pricing` },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
