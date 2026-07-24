import type { Metadata } from "next";
import { CallboardFeed } from "@/components/community/CallboardFeed";

export const metadata: Metadata = {
  title: "The Callboard · ActorRise",
  description: "See what actors are working on right now.",
};

export default function CallboardPage() {
  return <CallboardFeed />;
}
