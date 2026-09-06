"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/**
 * Records the first-touch acquisition source (utm_* + external referrer) on the
 * first page this browser loads. Mounted in the root layout so marketing pages
 * count too; that is where the first touch actually happens.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
