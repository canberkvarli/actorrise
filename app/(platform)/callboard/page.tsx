import type { Metadata } from "next";
import { CallboardFeed } from "@/components/community/CallboardFeed";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `The Callboard · ${BRAND.name}`,
  description: "See what actors are working on right now.",
};

export default function CallboardPage() {
  return <CallboardFeed />;
}
