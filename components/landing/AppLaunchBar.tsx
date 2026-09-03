"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";

import { APP_STORE_URL } from "@/components/landing/v2/GhostLightAppTeaser";

/**
 * Ghost Light is out, said where people actually are.
 *
 * The app section on the landing page is section 11 of 13: it starts 7,440px
 * down on a phone, which is 8.8 screens and 81% of the way through the page.
 * Nobody scrolls eight screens, so the launch was invisible to almost everyone
 * who arrived. This says it at zero screens instead.
 *
 * Deliberately not in the hero. The hero's job is "find a monologue in seconds",
 * and trading that for a download swaps the main conversion for a secondary one.
 * A bar above the header costs it nothing.
 *
 * It is also meant to be deleted. News stops being news, so this is one
 * self-contained file mounted in two places rather than a feature woven through
 * the layout.
 */

const DISMISS_KEY = "ar_ghostlight_launch_v1";

export function AppLaunchBar() {
  /* Two states, not one. `mounted` gates on the first client render because
     localStorage does not exist on the server: rendering the bar during SSR and
     then removing it in an effect is a hydration mismatch, and this page already
     logs one of those. Nothing renders until we know the answer. */
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* Safari in private mode throws on localStorage. Show the bar. */
      setDismissed(false);
    }
    setMounted(true);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Not being able to remember the dismissal is not a reason to ignore it. */
    }
  };

  if (!mounted || dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Ghost Light iOS app announcement"
      className="relative z-30 bg-primary-solid text-primary-solid-foreground"
    >
      {/* pr-10 keeps the text clear of the close button, which is absolute so it
          stays pinned right however the sentence wraps at 320px. */}
      <div className="container mx-auto flex items-center justify-center gap-x-3 gap-y-1 px-4 py-2 pr-10 text-center sm:px-6">
        <p className="text-[13px] font-medium leading-snug">
          Ghost Light is out on the App Store.{" "}
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap underline underline-offset-4 hover:no-underline"
          >
            Get it free
          </a>
        </p>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-2 opacity-70 transition-opacity hover:opacity-100 sm:right-3"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}

export default AppLaunchBar;
