"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { setScenePartnerTutorialSeen } from "@/lib/scenepartnerStorage";

const slides = [
  {
    id: 0,
    headline: "Rehearse with AI, line by line.",
    body: "Pick a scene. The AI reads its lines. You say yours. Simple.",
  },
  {
    id: 1,
    headline: "We’ll need your microphone.",
    body: "Next we’ll ask for mic access so you can speak your lines.",
  },
  {
    id: 2,
    headline: "Example scenes or your own script.",
    body: "Try a sample scene or upload a script. We extract characters and scenes for you.",
  },
  {
    id: 3,
    headline: "Focus mode.",
    body: "Dark view. AI says its line, then it’s your turn. No clutter.",
  },
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 48 : -48,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -48 : 48,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
};

interface ScenePartnerTutorialProps {
  onComplete: () => void;
}

export function ScenePartnerTutorial({ onComplete }: ScenePartnerTutorialProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);

  const dismiss = useCallback(() => {
    setScenePartnerTutorialSeen();
    onComplete();
  }, [onComplete]);

  const next = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide((s) => s + 1);
    } else {
      dismiss();
    }
  }, [currentSlide, dismiss]);

  const slide = slides[currentSlide];
  const isLast = currentSlide === slides.length - 1;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="ScenePartner intro"
    >
      {/* Backdrop: header and page visible but blurred */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-hidden="true"
      />

      {/* Floating card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const }}
        className="relative w-full max-w-md mx-4 rounded-3xl border border-border/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden"
      >
        <div className="relative flex flex-col items-center px-6 pt-10 pb-8">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip"
            className="absolute top-4 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 px-3"
          >
            Skip
          </button>

          <div className="min-h-[220px] w-full flex flex-col justify-center pt-8 pb-4">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={slide.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="text-center"
              >
                <h2 className="font-semibold text-xl sm:text-2xl text-foreground leading-tight mb-3">
                  {slide.headline}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {slide.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center gap-3 mb-6">
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {currentSlide + 1} / {slides.length}
            </span>
            <div className="flex items-center justify-center gap-2">
              {slides.map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    width: i === currentSlide ? 20 : 6,
                    backgroundColor:
                      i === currentSlide
                        ? "hsl(var(--primary))"
                        : "hsl(var(--muted-foreground) / 0.25)",
                  }}
                  transition={{ duration: 0.25 }}
                  className="h-1 rounded-full"
                />
              ))}
            </div>
          </div>

          <Button onClick={next} className="rounded-full h-11 px-8">
            {isLast ? "Get started" : "Next"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
