import type { Metadata } from "next";
import { API_URL } from "@/lib/api";
import { JoinClass, type LinkInfo } from "./JoinClass";

/* A teacher's class link (backend services/class_links.py). Not for search:
   each one is a private handout, and an indexed one is a leaked one. */
export const metadata: Metadata = {
  title: "Join your class",
  robots: { index: false, follow: false },
};

/* Read on the server so the ticket is in the HTML. Fetched in the browser it
   arrived a beat after the page, and the screen visibly assembled itself. */
async function readLink(code: string): Promise<LinkInfo | null> {
  try {
    const r = await fetch(`${API_URL}/api/class-links/${encodeURIComponent(code)}`, {
      next: { revalidate: 60 },
    });
    return r.ok ? ((await r.json()) as LinkInfo) : null;
  } catch {
    return null;
  }
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JoinClass code={code} info={await readLink(code)} />;
}
