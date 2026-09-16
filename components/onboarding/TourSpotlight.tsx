"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { theatreFontVars } from "@/lib/fonts/theatre";
import api from "@/lib/api";

export interface TourStep {
  /** The id of the element to light. A step whose target is absent is dropped. */
  targetId: string;
  title: string;
  body: string;
  placement: "bottom" | "top";
}

/**
 * Session latch for a tour that has been dismissed.
 *
 * The server flag is the durable record, but it is written asynchronously and
 * the parent's trigger effect reads a `user` that may not carry it yet. This
 * closes that window: once a tour is dismissed in this tab it stays dismissed,
 * whatever the refresh says. sessionStorage rather than localStorage on
 * purpose, so the server flag is still what decides on the actor's next visit
 * and a failed PATCH does not silently cost them the tour forever.
 */
const TOUR_LATCH = "actorrise_tour_seen";

export function markTourSeen(flag: string) {
  try {
    const seen = JSON.parse(sessionStorage.getItem(TOUR_LATCH) || "[]") as string[];
    if (!seen.includes(flag)) {
      sessionStorage.setItem(TOUR_LATCH, JSON.stringify([...seen, flag]));
    }
  } catch {
    /* sessionStorage unavailable — the server flag still covers the normal case */
  }
}

export function hasSeenTourThisSession(flag: string): boolean {
  try {
    return (JSON.parse(sessionStorage.getItem(TOUR_LATCH) || "[]") as string[]).includes(flag);
  } catch {
    return false;
  }
}

const PAD = 10;
const OFFSET = 14;
const CARD_W = 330;
const CARD_H = 210;
const EDGE = 16;

/* "(one of three.)" rather than "1 OF 5". Same information, and it is the
   only register the rest of the first-run flow speaks in. */
const ORDINAL = ["one", "two", "three", "four", "five", "six"];
const CARDINAL = ["", "one", "two", "three", "four", "five", "six"];
function beat(i: number, total: number) {
  const a = ORDINAL[i] ?? String(i + 1);
  const b = CARDINAL[total] ?? String(total);
  return total === 1 ? "(just this.)" : `(${a} of ${b}.)`;
}

/**
 * The followspot: one light on the thing being explained, and a playbill card
 * beside it. Shared by the search tour and the profile tour, which were the
 * same 230 lines twice over with different strings.
 *
 * A step whose target is not on the page is DROPPED, not shown floating in the
 * middle of a dimmed screen. Both tours had one of those — /monologues has had
 * no `search-filters` since the search rebuild, and the profile rail is not
 * rendered at all for educators — and the failure mode was a card explaining a
 * control that the reader could not see anywhere, which reads as the app being
 * broken rather than the tour being stale.
 */
export function TourSpotlight({
  steps,
  flag,
  onDismiss,
}: {
  steps: TourStep[];
  /** The `/api/auth/onboarding` boolean to set when the tour is finished or skipped. */
  flag: string;
  onDismiss: () => void;
}) {
  const [live, setLive] = useState<TourStep[] | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const done = useRef(false);

  const dismiss = useCallback(() => {
    if (done.current) return;
    done.current = true;
    // Latch in the session BEFORE anything async. The server write and the
    // refreshUser() that follows it race: dismiss fired the PATCH and returned,
    // the parent called refreshUser(), and if that read landed first the user
    // still carried has_seen_*_tour === false — so the parent's effect re-fired
    // and the actor was walked through the same tour a second time. `done` only
    // guards one mount, and the second showing is a fresh mount.
    markTourSeen(flag);
    void api.patch("/api/auth/onboarding", { [flag]: true }).catch(() => {});
    onDismiss();
  }, [flag, onDismiss]);

  // Resolve which steps actually have something to point at. One frame plus a
  // beat, so a target that mounts with the page still counts.
  useEffect(() => {
    const t = setTimeout(() => {
      const present = steps.filter((s) => document.getElementById(s.targetId));
      if (!present.length) {
        dismiss();
        return;
      }
      setLive(present);
    }, 120);
    return () => clearTimeout(t);
  }, [steps, dismiss]);

  const current = live?.[step];

  // Measure, and keep measuring: the page can scroll or reflow under the light
  // (the search tour never locked scroll, so it could and did drift).
  useEffect(() => {
    if (!current) return;
    const measure = () => {
      const el = document.getElementById(current.targetId);
      if (el) setRect(el.getBoundingClientRect());
    };
    measure();
    trackViewport(measure);
    return () => trackViewport(measure, true);
  }, [current]);

  // Escape leaves. A tour you cannot get out of with the keyboard is a trap.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const total = live?.length ?? 0;
  const isLast = step === total - 1;

  const next = useCallback(() => {
    if (isLast) dismiss();
    else setStep((s) => s + 1);
  }, [isLast, dismiss]);

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect || !current || typeof window === "undefined") return { display: "none" };
    const w = Math.min(CARD_W, window.innerWidth - EDGE * 2);
    // The phone tab bar sits at the bottom; nothing may tuck under it.
    const bottomSafe = window.innerWidth < 768 ? 88 : 24;
    const centerX = rect.left + rect.width / 2 - w / 2;
    const s: React.CSSProperties = {
      position: "fixed",
      width: w,
      zIndex: 10002,
      left: Math.max(EDGE, Math.min(centerX, window.innerWidth - w - EDGE)),
    };
    const below = window.innerHeight - (rect.bottom + OFFSET);
    const above = rect.top - OFFSET;
    const useBottom =
      current.placement === "bottom" ? below >= CARD_H || below >= above : above < CARD_H && below >= CARD_H;
    if (useBottom) {
      s.top = Math.max(24, Math.min(rect.bottom + OFFSET, window.innerHeight - CARD_H - bottomSafe));
    } else {
      s.bottom = Math.max(bottomSafe, Math.min(window.innerHeight - rect.top + OFFSET, window.innerHeight - CARD_H - 24));
    }
    return s;
  }, [rect, current]);

  if (!live || !current || !rect) return null;

  return (
    <div className={`theatre-tokens theatre-tour ${theatreFontVars} fixed inset-0 z-[10000]`} style={{ pointerEvents: "none" }}>
      {/* The followspot. One element: the ring is the light, the 9999px spread
          is the house going dark around it. */}
      <motion.div
        aria-hidden
        className="pointer-events-none rounded-2xl"
        style={{
          position: "fixed",
          zIndex: 10001,
          boxShadow:
            "0 0 0 2px var(--t-gel), 0 0 28px 4px color-mix(in oklab, var(--t-gel) 45%, transparent), 0 0 0 9999px oklch(0.08 0.01 50 / 0.72)",
        }}
        initial={false}
        animate={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }}
        transition={{ type: "tween", duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          role="dialog"
          aria-modal="true"
          aria-label={current.title}
          initial={{ opacity: 0, y: 14, rotate: -1.4 }}
          animate={{ opacity: 1, y: 0, rotate: -0.6 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: "tween", duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          style={{
            ...cardStyle,
            pointerEvents: "auto",
            background: "var(--card)",
            color: "var(--t-text)",
            borderColor: "var(--t-text)",
            boxShadow: "8px 8px 0 var(--t-gel), 0 24px 60px -20px rgb(0 0 0 / 0.7)",
          }}
          className="rounded-lg border-[1.5px] px-5 pb-4 pt-4"
        >
          <p
            className="m-0 text-xs italic tracking-[0.08em]"
            style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
          >
            {beat(step, total)}
          </p>
          <h3
            className="mt-1.5 font-normal leading-none tracking-[-0.02em]"
            style={{ fontFamily: "var(--t-display)", fontSize: 26 }}
          >
            {current.title}
          </h3>
          <p className="mt-2 text-sm leading-normal" style={{ color: "var(--t-muted-dark)" }}>
            {current.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="-m-2 flex min-h-11 items-center p-2 text-xs italic tracking-[0.06em] underline underline-offset-4 transition-colors"
              style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
            >
              skip
            </button>
            <motion.button
              type="button"
              onClick={next}
              whileHover={{ scale: 1.03, rotate: -1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              className="inline-flex h-11 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-sm font-bold"
              style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
            >
              {isLast ? "Got it" : "Next"}
              <span
                className="inline-flex size-8 items-center justify-center rounded-full"
                style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={isLast ? "m5 12 5 5L20 7" : "M5 12h14M13 6l6 6-6 6"} />
                </svg>
              </span>
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Attach (or, with `off`, detach) the handlers that keep the light on target. */
function trackViewport(fn: () => void, off = false) {
  const m = off ? window.removeEventListener : window.addEventListener;
  m.call(window, "resize", fn);
  m.call(window, "scroll", fn, true);
}
