import type { Metadata } from "next";
import { GreenRoomFeed } from "@/components/community/GreenRoomFeed";

export const metadata: Metadata = {
  title: "The Green Room · ActorRise",
  description: "See what actors are working on right now.",
};

export default function CommunityPage() {
  return <GreenRoomFeed />;
}
