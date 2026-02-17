"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { pageview, GA_MEASUREMENT_ID } from "@/lib/gtag";

/** Sends page_view to GA4 on route change (script is in root layout <head>). */
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID) return;
    const url = pathname ?? window.location.pathname;
    pageview(url);
  }, [pathname]);

  return null;
}
