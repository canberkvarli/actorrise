"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface TourStep {
  targetId: string;
  title: string;
  body: string;
  placement: "bottom" | "top";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "profile-progress",
    title: "Your completion",
    body: "Fill in the sections below to reach 100%. More details mean better matches.",
    placement: "bottom",
  },
  {
    targetId: "profile-headshot",
    title: "Headshot",
    body: "Add a photo so your profile stands out. JPG or PNG, max 5MB.",
    placement: "bottom",
  },
  {
    targetId: "profile-tabs",
    title: "Basic & acting info",
    body: "Name, age range, location, experience, and more. We use this to match you to roles.",
    placement: "bottom",
  },
  {
    targetId: "profile-preferences",
    title: "You're all set",
    body: "Use the Preferences tab to tune search and recommendations. Changes save automatically.",
    placement: "top",
  },
];

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_APPROX_HEIGHT = 220;
const VIEWPORT_PADDING = 24;

async function markProfileTourSeen() {
  try {
    await api.patch("/api/auth/onboarding", { has_seen_profile_tour: true });
  } catch {
    // Non-blocking
  }
}

interface ProfileTourProps {
  onDismiss: () => void;
}

export function ProfileTour({ onDismiss }: ProfileTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  // Lock body scroll while tour is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    setRect(null);
    setIsFallback(false);
    const tryFind = (attempt = 0) => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "instant" });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setRect(el.getBoundingClientRect());
          });
        });
      } else if (attempt < 2) {
        setTimeout(() => tryFind(attempt + 1), 50);
      } else {
        setIsFallback(true);
        const W = typeof window !== "undefined" ? window.innerWidth : 400;
        const H = typeof window !== "undefined" ? window.innerHeight : 300;
        setRect(new DOMRect(0, 0, W, H));
      }
    };
    tryFind(0);
  }, [currentStep.targetId]);

  useEffect(() => {
    const onResize = () => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        setRect(el.getBoundingClientRect());
        setIsFallback(false);
      } else if (typeof window !== "undefined") {
        setIsFallback(true);
        setRect(new DOMRect(0, 0, window.innerWidth, window.innerHeight));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentStep.targetId]);

  const dismiss = useCallback(async () => {
    await markProfileTourSeen();
    onDismiss();
  }, [onDismiss]);

  const next = useCallback(() => {
    if (isLast) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, dismiss]);

  const spotlightRect =
    rect && !isFallback
      ? {
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
        }
      : null;

  const tooltipStyle: React.CSSProperties = (() => {
    if (!rect) return { display: "none" };
    if (typeof window === "undefined") return { display: "none" };
    const tooltipWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - 32);
    const style: React.CSSProperties = { position: "fixed", width: tooltipWidth, maxWidth: "calc(100vw - 32px)", zIndex: 10002 };
    if (isFallback) {
      style.left = Math.max(16, (window.innerWidth - tooltipWidth) / 2);
      style.top = Math.max(VIEWPORT_PADDING, (window.innerHeight - TOOLTIP_APPROX_HEIGHT) / 2);
      return style;
    }
    const { placement } = currentStep;
    const centerX = rect.left + rect.width / 2 - tooltipWidth / 2;
    const clampedX = Math.max(16, Math.min(centerX, window.innerWidth - tooltipWidth - 16));
    style.left = clampedX;

    const spaceBelow = window.innerHeight - (rect.bottom + TOOLTIP_OFFSET);
    const spaceAbove = rect.top - TOOLTIP_OFFSET;
    const useBottom = placement === "bottom"
      ? spaceBelow >= TOOLTIP_APPROX_HEIGHT || spaceBelow >= spaceAbove
      : spaceAbove < TOOLTIP_APPROX_HEIGHT && spaceBelow >= TOOLTIP_APPROX_HEIGHT;

    if (useBottom) {
      const top = rect.bottom + TOOLTIP_OFFSET;
      style.top = Math.max(VIEWPORT_PADDING, Math.min(top, window.innerHeight - TOOLTIP_APPROX_HEIGHT - VIEWPORT_PADDING));
    } else {
      const bottom = window.innerHeight - rect.top + TOOLTIP_OFFSET;
      style.bottom = Math.max(VIEWPORT_PADDING, Math.min(bottom, window.innerHeight - TOOLTIP_APPROX_HEIGHT - VIEWPORT_PADDING));
    }
    return style;
  })();

  return (
    <div
      className="fixed inset-0 z-[10000] overflow-hidden"
      style={{ pointerEvents: "auto" }}
      aria-modal="true"
    >
      {isFallback && (
        <div
          className="absolute inset-0 bg-black/50"
          style={{ zIndex: 10000, pointerEvents: "none" }}
          aria-hidden
        />
      )}
      {/* Spotlight – white outline + animated between steps */}
      {spotlightRect && (
        <motion.div
          className="pointer-events-none rounded-xl"
          style={{
            position: "fixed",
            zIndex: 10001,
            boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 9999px rgba(0,0,0,0.65)",
          }}
          initial={false}
          animate={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
          transition={{
            type: "tween",
            duration: 0.4,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        />
      )}

      <AnimatePresence mode="wait">
        {rect && (
          <motion.div
            key={step}
            ref={tooltipRef}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            transition={{ type: "tween", duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ ...tooltipStyle, pointerEvents: "auto" }}
            className="rounded-2xl border border-border/50 bg-card/95 backdrop-blur-md shadow-xl shadow-black/40 p-5"
          >
            <p className="text-[10px] font-medium uppercase tracking-widest text-primary/70 mb-2">
              {step + 1} of {TOUR_STEPS.length}
            </p>
            <h3 className="font-brand text-lg font-semibold text-foreground mb-1.5">
              {currentStep.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {currentStep.body}
            </p>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center -m-2 text-xs text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
              >
                Skip tour
              </button>
              <Button size="sm" onClick={next} className="rounded-full px-5 min-h-[44px] touch-manipulation">
                {isLast ? "Got it" : "Next"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
