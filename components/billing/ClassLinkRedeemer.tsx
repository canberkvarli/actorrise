"use client";

import { useEffect, useRef } from "react";
import { mutate } from "swr";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { dropClassCode, heldClassCode } from "@/lib/classLink";

/**
 * Spends the class code a student brought from /join/<code>, once they are
 * signed in (backend services/class_links.py decides what they get). The code
 * is dropped whatever the answer, except a network failure, so a dead or
 * switched-off link is not retried on every page. Renders null.
 */
export function ClassLinkRedeemer() {
  const { user } = useAuth();
  const sent = useRef(false);

  useEffect(() => {
    if (!user || sent.current) return;
    const code = heldClassCode();
    if (!code) return;
    sent.current = true;
    api
      .post(`/api/class-links/${code}/join`)
      .then(() => {
        dropClassCode();
        mutate("/api/subscriptions/me");
      })
      .catch((err: { status?: number; response?: { status?: number } }) => {
        const status = err?.status ?? err?.response?.status;
        if (status && status >= 400 && status < 500) dropClassCode();
        else sent.current = false;
      });
  }, [user]);

  return null;
}
