import type { Metadata } from "next";
import StudioGate from "@/components/studio/StudioGate";

// CAN-17. The Studio: for Canberk only for now (the API decides, see
// backend/app/api/studio.py). Not linked from anywhere, and kept out of search.
export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

export default function StudioCubePage() {
  return <StudioGate />;
}
