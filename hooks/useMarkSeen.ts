"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import api from "@/lib/api";
import type { SeenSurface } from "@/lib/adminNav";

/**
 * Stamp a surface as seen, once, on mount, then refresh the badges.
 *
 * Fire-and-forget on purpose: a failed stamp leaves the badge up, which is the
 * safe direction to fail in. Losing a badge you never looked at is the bug;
 * seeing one twice is an annoyance.
 */
export function useMarkSeen(surface: SeenSurface) {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    api
      .post(`/api/admin/seen/${surface}`)
      .then(() => {
        if (!cancelled) qc.invalidateQueries({ queryKey: ["admin-pulse"] });
      })
      .catch(() => {
        /* badge stays up; next visit tries again */
      });
    return () => {
      cancelled = true;
    };
  }, [surface, qc]);
}
