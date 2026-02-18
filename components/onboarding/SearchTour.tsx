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
    targetId: "search-input",
    title: "Search in plain English.",
    body: "Type anything — \"a Chekhov monologue for a woman in her 30s\" — and we'll understand.",
    placement: "bottom",
  },
  {
    targetId: "search-filters",
    title: "Narrow it down.",
    body: "Filter by gender, age range, emotion, or theme. Mix and match to find exactly what you need.",
    placement: "bottom",
  },
  {
    targetId: "search-results",
    title: "Your matches.",
    body: "Results are ranked by how well they fit your profile and your search. Best matches come first.",
    placement: "top",
  },
  {
    targetId: "search-find-for-me",
    title: "Let AI choose for you.",
    body: "\"Find for me\" uses your profile to recommend monologues you haven't considered yet.",
    placement: "bottom",
  },
];

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_WIDTH = 320;

async function markSearchTourSeen() {
  try {
    await api.patch("/api/auth/onboarding", { has_seen_search_tour: true });
  } catch {
    // Non-blocking
  }
}

interface SearchTourProps {
  onDismiss: () => void;
}

export function SearchTour({ onDismiss }: SearchTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  // Find the target element; 1 quick retry then fallback so transitions feel instant (no 1s+ wait).
  // When target is missing (e.g. search-results before any search), we use fallback and show tooltip-only UI.
  useEffect(() => {
    setRect(null);
    setIsFallback(false);
    const tryFind = (attempt = 0) => {
      const el = document.getElementById(currentStep.targetId);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else if (attempt < 2) {
        setTimeout(() => tryFind(attempt + 1), 50);
      } else {
        setIsFallback(true);
        // Dummy rect only for tooltip positioning; we won't draw spotlight
        const W = typeof window !== "undefined" ? window.innerWidth : 400;
        const H = typeof window !== "undefined" ? window.innerHeight : 300;
        setRect(new DOMRect(0, 0, W, H));
      }
    };
    tryFind(0);
  }, [currentStep.targetId]);

  // Re-measure on window resize (real element or fallback)
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
    await markSearchTourSeen();
    onDismiss();
  }, [onDismiss]);

  const next = useCallback(() => {
    if (isLast) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, dismiss]);

  // Spotlight: only when we have a real target; skip for fallback so we don't show a random box
  const spotlightStyle: React.CSSProperties =
    rect && !isFallback
      ? {
          position: "fixed",
          top: rect.top - SPOTLIGHT_PADDING,
          left: rect.left - SPOTLIGHT_PADDING,
          width: rect.width + SPOTLIGHT_PADDING * 2,
          height: rect.height + SPOTLIGHT_PADDING * 2,
          borderRadius: 12,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          pointerEvents: "none",
          zIndex: 10001,
          transition: "top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease",
        }
      : { display: "none" };

  // Tooltip position: real target = next to element; fallback = centered card (no fake pointer)
  const tooltipStyle: React.CSSProperties = (() => {
    if (!rect) return { display: "none" };
    if (typeof window === "undefined") return { display: "none" };
    const style: React.CSSProperties = { position: "fixed", width: TOOLTIP_WIDTH, zIndex: 10002 };
    if (isFallback) {
      style.left = Math.max(16, (window.innerWidth - TOOLTIP_WIDTH) / 2);
      style.top = Math.max(24, (window.innerHeight - 220) / 2);
      return style;
    }
    const { placement } = currentStep;
    const centerX = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const clampedX = Math.max(16, Math.min(centerX, window.innerWidth - TOOLTIP_WIDTH - 16));
    style.left = clampedX;
    if (placement === "bottom") {
      style.top = rect.bottom + TOOLTIP_OFFSET;
    } else {
      style.bottom = window.innerHeight - rect.top + TOOLTIP_OFFSET;
    }
    return style;
  })();

  return (
    <div className="fixed inset-0 z-[10000]" style={{ pointerEvents: "none" }}>
      {/* Fallback: soft dim only (no spotlight cutout) */}
      {isFallback && (
        <div
          className="absolute inset-0 bg-black/50"
          style={{ zIndex: 10000, pointerEvents: "none" }}
          aria-hidden
        />
      )}
      {/* Spotlight (real target only) */}
      <div style={spotlightStyle} />

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {rect && (
          <motion.div
            key={step}
            ref={tooltipRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
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
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip tour
              </button>
              <Button size="sm" onClick={next} className="rounded-full px-5">
                {isLast ? "Got it" : "Next"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
