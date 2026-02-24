"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

const slides = [
  {
    id: 0,
    eyebrow: "Welcome to Actorrise",
    headline: "The stage is yours.",
    body: "Actorrise helps you find the perfect monologue for every audition. Powered by AI, built for actors.",
  },
  {
    id: 1,
    eyebrow: "Your profile",
    headline: "Your profile is your casting director.",
    body: "The more we know about you (your age range, experience, type), the sharper our recommendations. It takes two minutes.",
  },
  {
    id: 2,
    eyebrow: "MonologueMatch",
    headline: "Your monologue is waiting.",
    body: "Search in plain English. \"A dramatic monologue for a woman in her 30s, Chekhov.\" We'll find it.",
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

async function markWelcomeSeen() {
  try {
    await api.patch("/api/auth/onboarding", { has_seen_welcome: true });
  } catch {
    // Non-blocking: onboarding flag update failure shouldn't block the user
  }
}

interface WelcomeFlowProps {
  onDismiss: () => void;
}

export function WelcomeFlow({ onDismiss }: WelcomeFlowProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const router = useRouter();

  const dismiss = useCallback(async () => {
    await markWelcomeSeen();
    onDismiss();
  }, [onDismiss]);

  const next = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide((s) => s + 1);
    }
  }, [currentSlide]);

  const goToProfile = useCallback(async () => {
    await markWelcomeSeen();
    onDismiss();
    router.push("/profile");
  }, [onDismiss, router]);

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  // Lock body scroll and prevent pull-to-refresh / swipe gestures while modal is open (mobile + web)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscrollBehavior;
    };
  }, []);

  // Prevent touch move from scrolling or triggering browser back (keep slides static)
  const preventTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center touch-none overflow-hidden"
      style={{ touchAction: "none" }}
      onTouchMove={preventTouchMove}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Actorrise"
    >
      {/* Backdrop: no click/tap dismiss; only Skip / Continue / Complete / Start exploring close the flow */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }}
        className="relative w-full max-w-lg mx-4 rounded-3xl border border-border/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative px-8 pt-10 pb-8">
          {/* Skip */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip welcome tour"
            className="absolute top-5 right-5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary transition-colors px-3 py-2"
          >
            Skip
          </button>

          {/* Slide content */}
          <div className="min-h-[200px] flex flex-col justify-center">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={slide.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex flex-col gap-3"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-primary/80">
                  {slide.eyebrow}
                </p>
                <h2 className="font-brand text-3xl font-semibold text-foreground leading-tight">
                  {slide.headline}
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed">
                  {slide.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-8 mb-6">
            {slides.map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  width: i === currentSlide ? 24 : 6,
                  backgroundColor:
                    i === currentSlide
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted-foreground) / 0.3)",
                }}
                transition={{ duration: 0.3 }}
                className="h-1.5 rounded-full"
              />
            ))}
          </div>

          {/* CTAs */}
          {isLast ? (
            <div className="flex flex-col gap-3">
              <Button onClick={goToProfile} className="w-full rounded-full h-11">
                Complete my profile
              </Button>
              <Button
                variant="ghost"
                onClick={dismiss}
                className="w-full rounded-full h-11 text-muted-foreground"
              >
                Start exploring
              </Button>
            </div>
          ) : (
            <Button onClick={next} className="w-full rounded-full h-11">
              Continue
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
