"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { setStoredLastAuthMethod } from "@/lib/last-auth-method";

export function LastAuthProviderSync() {
  const searchParams = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    const provider = searchParams.get("provider");
    if (!provider || done.current) return;
    if (provider !== "google" && provider !== "apple") return;

    setStoredLastAuthMethod(provider);
    done.current = true;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("provider");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch {
      // ignore
    }
  }, [searchParams]);

  return null;
}
