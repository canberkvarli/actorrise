"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";
import { useAuth } from "@/lib/auth";

const KEY = "aud-strip-dismissed";

/**
 * One slim line for people with nothing upcoming. Dismissal is per browser
 * (localStorage), not per user: no new column, and a strip that comes back on
 * another device is harmless. Renders nothing until the list and localStorage
 * are both read, which avoids a hydration mismatch. It does appear after the
 * fetch, so hosts place it below their fixed content and it fades in.
 */
export function AuditionStrip({ surface }: { surface: "rehearse" | "monologues" }) {
  // Moderators only while Canberk tries the tracker: no query, no strip for anyone else.
  const { user } = useAuth();
  const isModerator = !!user?.is_moderator;
  const { data } = useAuditions(isModerator);
  const [hidden, setHidden] = useState(true);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(KEY) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const visible = !hidden && !!data && !data.some((a) => a.scope === "upcoming");
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);
  if (!isModerator || hidden || !data || data.some((a) => a.scope === "upcoming")) return null;
  return (
    <div className={`mt-4 flex items-center justify-between gap-3 text-sm transition-opacity duration-500 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
      style={{ color: "var(--t-text)" }}>
      <Link
        href="/auditions?new=1"
        onClick={() => trackEvent("audition_strip_clicked", { surface })}
        className="underline-offset-2 hover:underline"
      >
        Got an audition coming up? Add it and I&apos;ll remind you.
      </Link>
      <button
        type="button"
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
