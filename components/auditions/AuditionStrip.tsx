"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";

const KEY = "aud-strip-dismissed";

/**
 * One slim line for people with nothing upcoming. Dismissal is per browser
 * (localStorage), not per user: no new column, and a strip that comes back on
 * another device is harmless. Renders nothing until the list and localStorage
 * are both read, so it never shifts the page or mismatches on hydration.
 */
export function AuditionStrip({ surface }: { surface: "rehearse" | "monologues" }) {
  const { data } = useAuditions();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden || !data || data.some((a) => a.scope === "upcoming")) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 text-sm" style={{ color: "var(--t-text)" }}>
      <Link
        href="/auditions?new=1"
        onClick={() => trackEvent("audition_strip_clicked", { surface })}
        className="underline-offset-2 hover:underline"
      >
        Got an audition coming up? Add it and I&apos;ll remind you.
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 text-xs opacity-70 hover:opacity-100"
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // private mode: it just comes back next visit
          }
          setHidden(true);
        }}
      >
        not now
      </button>
    </div>
  );
}
