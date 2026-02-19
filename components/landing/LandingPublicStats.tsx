"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/**
 * Fetches public stats (e.g. total_searches) and displays a short line for the landing page.
 * Fallback: hide the count or show static text if the request fails.
 */
export function LandingPublicStats() {
  const [totalSearches, setTotalSearches] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `${API_URL}/api/public/stats`;
    fetch(url, { method: "GET" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { total_searches?: number } | null) => {
        if (cancelled || !data || typeof data.total_searches !== "number") return;
        setTotalSearches(data.total_searches);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (totalSearches === null || totalSearches < 1) return null;

  const formatted =
    totalSearches >= 1000
      ? `${(totalSearches / 1000).toFixed(1).replace(/\.0$/, "")}k+`
      : `${totalSearches}+`;

  return (
    <p className="text-center text-sm text-muted-foreground mt-2">
      {formatted} monologues found so far.
    </p>
  );
}
