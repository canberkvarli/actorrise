"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { isApplePlatform, subscribeUrl, type CalendarProvider } from "@/lib/calendarFeed";
import { useCalendarLink } from "@/hooks/useAuditions";

type Surface = "header" | "first_save";

const PROVIDERS: { id: CalendarProvider; label: string; newTab: boolean }[] = [
  { id: "google", label: "Google", newTab: true },
  // webcal:// hands straight to Calendar on a Mac or an iPhone; a new tab would just sit empty.
  { id: "apple", label: "Apple", newTab: false },
  { id: "outlook", label: "Outlook", newTab: true },
];

/**
 * Google / Apple / Outlook subscribe links and a copy button for the feed.
 * Mounting it is what fetches the feed URL, so it is only ever mounted once
 * someone has asked for it (or has just saved their first audition).
 */
export function CalendarOptions({ surface }: { surface: Surface }) {
  const { data, isError, refetch, isFetching } = useCalendarLink(true);
  // Decided after mount so the server render and the first client render agree.
  const [apple, setApple] = useState(true);
  useEffect(() => setApple(isApplePlatform(navigator as Parameters<typeof isApplePlatform>[0])), []);
  const picked = (provider: CalendarProvider | "copy") => trackEvent("calendar_feed_subscribed", { provider, surface });

  if (isError && !data) {
    return (
      <p className="aud-cap-muted text-sm">
        I couldn&apos;t get your link.{" "}
        <button type="button" className="aud-link aud-focus" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "trying again" : "try again"}
        </button>
      </p>
    );
  }
  if (!data) return <p className="aud-cap-muted text-sm" role="status">Getting your link.</p>;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard (an old browser, an insecure origin): show the link so it can be copied by hand.
      toast(url, { duration: 20_000 });
      return;
    }
    picked("copy");
    toast.success("Copied. Add it in your calendar as a subscription from a URL.");
  }

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Subscribe in">
      {PROVIDERS.filter((p) => p.id !== "apple" || apple).map((p) => (
        <li key={p.id}>
          <a
            href={subscribeUrl(p.id, data.url)}
            {...(p.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="aud-cal-btn aud-focus inline-flex h-10 items-center gap-1.5 px-3 text-sm font-semibold"
            onClick={() => picked(p.id)}
          >
            <CalendarGlyph />
            {p.label}
          </a>
        </li>
      ))}
      <li>
        <button type="button" className="aud-link aud-cap-muted aud-focus px-1 text-sm font-medium" onClick={() => copy(data.url)}>
          copy link
        </button>
      </li>
    </ul>
  );
}

export const CALENDAR_PANEL_ID = "aud-calendar-panel";

/**
 * The header control once the rail has tickets: a quiet link that opens the
 * options in place. The shell owns `open` so the panel can sit full width
 * under the header rather than squeezed beside "How it works".
 */
export function CalendarToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="aud-link aud-cap-muted aud-focus text-sm font-medium"
      aria-expanded={open}
      aria-controls={CALENDAR_PANEL_ID}
      onClick={onToggle}
    >
      put them in your calendar
    </button>
  );
}

export function CalendarPanel({ onClose }: { onClose: () => void }) {
  return (
    <div id={CALENDAR_PANEL_ID} className="aud-cal-panel mb-6 w-full max-w-[400px] px-5 pb-4 pt-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="aud-sec-title text-[22px]">In your calendar</p>
        <button type="button" className="aud-x aud-focus -mr-1.5" aria-label="Close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="aud-cap-muted mb-3.5 mt-1 text-[13.5px] leading-snug">Every audition shows up next to everything else, and I keep it up to date.</p>
      <CalendarOptions surface="header" />
    </div>
  );
}

/** Offered once, right after the first audition is saved. */
export function CalendarOffer({ onDone }: { onDone: () => void }) {
  const title = useId();
  return (
    <section aria-labelledby={title} className="aud-cal-offer px-4 py-4">
      <p className="aud-hero-dir aud-cap-muted text-[15px]">(one more thing)</p>
      <h2 id={title} className="aud-title mt-0.5 text-[26px] leading-tight">Put them in your calendar?</h2>
      <p className="mb-3.5 mt-1 text-sm">Every audition you add shows up there too, and I keep it up to date.</p>
      <CalendarOptions surface="first_save" />
      <button type="button" className="aud-link aud-cap-muted aud-focus mt-3 text-sm" onClick={onDone}>
        not now
      </button>
    </section>
  );
}

function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="1.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}
