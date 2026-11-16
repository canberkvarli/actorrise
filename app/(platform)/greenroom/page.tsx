import type { Metadata } from "next";
import { GreenRoomLibrary } from "@/components/greenroom/GreenRoomLibrary";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `The Green Room · ${BRAND.name}`,
  description: "Rehearse a scene with another actor.",
};

export default function GreenRoomPage() {
  return <GreenRoomLibrary />;
}
