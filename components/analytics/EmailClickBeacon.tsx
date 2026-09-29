"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/events";

/** A touch name as the backend writes it: day3, checkout_abandoned, ... */
const TOUCH = /^[a-z0-9_]{1,32}$/;

/**
 * Counts a click on an email's link.
 *
 * Every lifecycle and triggered email carries ?e=<touch> on its one link
 * (backend/app/services/email/triggered.py). Landing with it writes
 * email_clicked, then the parameter is taken off the URL so a reload or a
 * shared link does not count twice.
 *
 * A click from someone signed out is lost: POST /api/events needs a session.
 * Accepted. The alternative is a redirect through the API, which puts a
 * tracking domain in every link and is what gets a personal email filed as
 * promotion.
 */
export function EmailClickBeacon() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const touch = params.get("e");

  useEffect(() => {
    if (!touch) return;
    if (TOUCH.test(touch)) trackEvent("email_clicked", { touch });
    const rest = new URLSearchParams(params.toString());
    rest.delete("e");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [touch, params, pathname, router]);

  return null;
}
