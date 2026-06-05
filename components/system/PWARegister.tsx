"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (/sw.js) in production only.
 * No-op in development so it never interferes with HMR.
 * Renders nothing.
 */
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* swallow registration errors */
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
