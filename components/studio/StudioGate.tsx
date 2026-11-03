"use client";

/**
 * The Studio is closed to everyone but Canberk for now. The API decides
 * (backend/app/api/studio.py, sensitive-admin only); this asks it once and
 * shows the stage only on a yes. Signed out, or anyone else: a closed door,
 * and nothing of the Studio loads.
 */

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import EffortCube from "./EffortCube";
import { display } from "./style";

type Access = "checking" | "open" | "closed" | "signed_out";

export default function StudioGate() {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [answer, setAnswer] = useState<{ id: number; open: boolean } | null>(null);

  useEffect(() => {
    if (loading || userId === null) return;
    let cancelled = false;
    api
      .get("/api/studio/roles", { timeoutMs: 15000 })
      .then(() => !cancelled && setAnswer({ id: userId, open: true }))
      .catch(() => !cancelled && setAnswer({ id: userId, open: false }));
    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  const access: Access = loading
    ? "checking"
    : userId === null
      ? "signed_out"
      : answer?.id !== userId
        ? "checking"
        : answer.open
          ? "open"
          : "closed";

  if (access === "open") return <EffortCube />;

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#0b0b0c",
        color: "#f4f4f2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      {access === "checking" ? null : (
        <div style={{ maxWidth: 360 }}>
          <div style={{ ...display, fontSize: 28 }}>This room isn&apos;t open.</div>
          {access === "signed_out" && (
            <a
              href="/login?redirect=/studio"
              style={{ display: "inline-block", marginTop: 14, fontSize: 13, color: "#f4f4f2", textDecoration: "underline" }}
            >
              Sign in
            </a>
          )}
        </div>
      )}
    </main>
  );
}
