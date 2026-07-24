import type { Metadata } from "next";
import { GreenRoomLibrary } from "@/components/greenroom/GreenRoomLibrary";
import { GhostLightIntro } from "@/components/greenroom/GhostLightIntro";

export const metadata: Metadata = {
  title: "The Green Room · ActorRise",
  description: "Rehearse a scene with another actor.",
};

export default function GreenRoomPage() {
  return (
    <>
      <GhostLightIntro />
      <GreenRoomLibrary />
    </>
  );
}
