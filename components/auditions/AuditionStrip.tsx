"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

import { trackEvent } from "@/lib/events";
import { useAuditions } from "@/hooks/useAuditions";

const KEY = "aud-strip-dismissed";

/**
 * The audition ask, for people with nothing upcoming. Dismissal is per browser
 * (localStorage), not per user: no new column, and an ask that comes back on
 * another device is harmless.
 *
 * Renders nothing until the list and localStorage are both read, which avoids
 * a hydration mismatch. Because it arrives after a fetch, a host must mount it
 * where nothing below it can be pushed around, and only once the host's own
 * content has landed (the Collection mounts it last, after the shelf settles).
 *
 * One action and one quiet way out. The action opens /auditions on the paste
 * box (`?new=paste`), not the fill-it-in form: pasting the casting email is
 * the fast path, and the form is one tap away from there.
 */
export function AuditionStrip({ surface }: { surface: "rehearse" | "monologues" }) {
  const { data } = useAuditions();
  // Read as an external store, hidden on the server pass, so SSR and the
  // first client pass agree without an effect that sets state on mount.
  const storedHidden = useSyncExternalStore(subscribeNever, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const hidden = storedHidden || dismissed;
  const [shown, setShown] = useState(false);
  const visible = !hidden && !!data && !data.some((a) => a.scope === "upcoming");
  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);
  if (!visible) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // private mode: it just comes back next visit
    }
    setDismissed(true);
  }

  return (
    <section
      aria-labelledby="aud-strip-h"
      className={`mt-10 border-t pt-6 transition-opacity duration-500 motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
      style={{ borderColor: "var(--t-line-light-2)", color: "var(--t-text)" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0 max-w-[46ch]">
          <h2 id="aud-strip-h" className="text-[17px] font-semibold leading-snug">
            Got an audition coming up?
          </h2>
          <p className="mt-1 text-[15px] leading-normal" style={{ color: "var(--t-muted-dark)" }}>
            Paste the casting email and I&apos;ll keep you on it, reminders included.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/auditions?new=paste"
            onClick={() => trackEvent("audition_strip_clicked", { surface })}
            className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            Add it
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-11 items-center rounded-full px-4 text-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
            style={{ color: "var(--t-muted-dark)" }}
          >
            Not now
          </button>
        </div>
      </div>
    </section>
  );
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Nothing to subscribe to: the in-tab dismissal is held in state instead. */
function subscribeNever() {
  return () => {};
}
