"use client";

import { useState } from "react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { useCalendarLink } from "@/hooks/useAuditions";

export function CalendarLink() {
  const [open, setOpen] = useState(false);
  const { data, isError } = useCalendarLink(open);
  return (
    <div className="aud-dir text-[11.5px]">
      {!open ? (
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setOpen(true)}>
          put these in my calendar
        </button>
      ) : data ? (
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(data.url);
            } catch {
              // No clipboard (an old browser, an insecure origin): show the link so it can be copied by hand.
              toast(data.url, { duration: 20_000 });
              return;
            }
            trackEvent("calendar_feed_subscribed");
            toast.success("Copied. In Google Calendar: Other calendars, From URL. On iPhone: Settings, Calendar, Add Subscribed Calendar.");
          }}
        >
          copy the calendar link
        </button>
      ) : isError ? (
        <span className="aud-muted">couldn&apos;t get the link, try again later</span>
      ) : (
        <span className="aud-muted">getting the link</span>
      )}
    </div>
  );
}
