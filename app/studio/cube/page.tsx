import type { Metadata } from "next";
import EffortCube from "@/components/studio/EffortCube";

// CAN-17. A hidden first instrument of the Studio: Laban's effort cube.
// Not linked from anywhere yet, and kept out of search.
export const metadata: Metadata = {
  title: "The effort cube · Studio",
  robots: { index: false, follow: false },
};

export default function StudioCubePage() {
  return <EffortCube />;
}
