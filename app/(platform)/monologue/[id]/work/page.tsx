"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import { MonologueCueing } from "@/components/monologue-work/MonologueCueing";

/**
 * The stage fills what is LEFT of the viewport, not all of it.
 *
 * This page was `h-dvh` while sitting under the platform's sticky header, so it
 * was always a header taller than the screen and the control dock at its foot
 * (Reveal / Skip / Restart) hung permanently below the fold. You couldn't even
 * scroll to it: on the running screen the monologue scrolls inside its own
 * container, not the page.
 *
 * The header's height is measured rather than hardcoded. A constant would be a
 * second place to remember whenever the nav changes, and it has already been
 * two different numbers (64 phone / 80 desktop) — subtracting the wrong one
 * just moves the clipping instead of fixing it.
 */
function useRemainingViewportHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState("100dvh");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Distance from the top of the document to the top of the stage — which
      // is exactly whatever chrome sits above it.
      const offset = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY));
      setHeight(`calc(100dvh - ${offset}px)`);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return { ref, height };
}

export default function MonologueWorkPage() {
  const id = useParams().id as string;
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const { ref, height } = useRemainingViewportHeight();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.get<Monologue>(`/api/monologues/${id}`);
        if (!active) return;
        setMonologue(res.data);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        const code = (error as Error & { response?: { status?: number } })?.response?.status;
        setStatus(code === 404 ? "notfound" : "error");
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    /* The height stays definite — children use h-full and would collapse
       against a min-height — but it is no longer the only thing painting the
       screen. A height computed from 100dvh is a promise the browser does not
       keep: iOS Safari changes dvh as the URL bar collapses, so the slab ended
       up shorter than the window and the page underneath showed through along
       the bottom as a band of cream under a dark stage. The backdrop below
       covers the viewport whatever the arithmetic does, so a shortfall has
       nothing to reveal. .stage-surface makes the whole thing follow the theme
       (see globals.css), which is the other half of the same bug. */
    <div
      ref={ref}
      style={{ height }}
      className="stage-surface relative bg-[var(--stage)] text-[var(--stage-fg)]"
    >
      <div aria-hidden className="fixed inset-0 -z-10 bg-[var(--stage)]" />
      {status === "loading" && (
        <div className="flex h-full items-center justify-center">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        </div>
      )}

      {(status === "notfound" || status === "error") && (
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <p className="font-sans text-[var(--stage-fg)]/60">
            {status === "notfound"
              ? "This piece has left the stage."
              : "Something went dark loading this piece."}
          </p>
          <button onClick={() => router.back()} className="text-sm text-primary hover:underline">
            Go back
          </button>
        </div>
      )}

      {status === "ready" && monologue && (
        <MonologueCueing monologue={monologue} onExit={() => router.back()} />
      )}
    </div>
  );
}
