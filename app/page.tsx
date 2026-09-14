import type { Metadata } from "next";
import { TheatreWalk } from "@/components/landing/v2/theatre/TheatreWalk";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.actorrise.com";

// Self-canonical so Google doesn't flag the homepage as a duplicate (it had none).
// Title/OG/Twitter are inherited from the root layout's defaults.
export const metadata: Metadata = {
  alternates: { canonical: siteUrl },
};

export default function LandingPage() {
  return <TheatreWalk />;
}
