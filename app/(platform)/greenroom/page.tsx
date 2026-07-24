import type { Metadata } from "next";
import { GreenRoomLibrary } from "@/components/greenroom/GreenRoomLibrary";

export const metadata: Metadata = {
  title: "The Green Room · ActorRise",
  description: "Rehearse a scene with another actor.",
};

export default function GreenRoomPage() {
  return <GreenRoomLibrary />;
}
