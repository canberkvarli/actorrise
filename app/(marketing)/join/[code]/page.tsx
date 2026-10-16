import type { Metadata } from "next";
import { JoinClass } from "./JoinClass";

/* A teacher's class link (backend services/class_links.py). Not for search:
   each one is a private handout, and an indexed one is a leaked one. */
export const metadata: Metadata = {
  title: "Join your class",
  robots: { index: false, follow: false },
};

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinClass code={code} />;
}
