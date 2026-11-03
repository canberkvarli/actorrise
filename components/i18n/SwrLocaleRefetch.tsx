"use client";

import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";
import { useLocale } from "@/lib/i18n";

/**
 * The UI language picks the library (CAN-19): the Turkish UI is served
 * Turkish pieces only, and every request says which (lib/api.ts). When the
 * language is switched mid-visit, everything SWR holds is fetched again, so no
 * list drawn in one language stays on screen in the other. Sits inside the
 * platform's SWRConfig; renders nothing.
 */
export function SwrLocaleRefetch() {
  const locale = useLocale();
  const { mutate } = useSWRConfig();
  const seen = useRef(locale);
  useEffect(() => {
    if (seen.current === locale) return;
    seen.current = locale;
    void mutate(() => true);
  }, [locale, mutate]);
  return null;
}
