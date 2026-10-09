"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconX } from "@tabler/icons-react";

import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { IntroStage, SceneCapture, SceneNotes, ScenePrep } from "./intro/IntroScenes";
import s from "./intro/intro.module.css";

export const SLIDES = [
  {
    title: "Every audition, one rail.",
    body: "Paste the casting email or drop the breakdown and I'll read it into a ticket. Or fill it in yourself, that's always free.",
    scene: SceneCapture,
    picture: "A casting email is pasted into the box, read, and folded into a ticket at the top of the rail.",
  },
  {
    title: "Each one gets its own page.",
    body: "Read your sides right there, run them with ScenePartner, and tick off what to pack as you go.",
    scene: ScenePrep,
    picture: "A ticket opens its prep room and the three steps tick off one by one.",
  },
  {
    title: "I'll keep you on it.",
    body: "A note three days out, one the night before, and one the morning after so you can log how it went. Add the calendar feed and they show up next to everything else.",
    scene: SceneNotes,
    picture: "Three notes land on the week around the audition, and the morning after asks how it went.",
  },
] as const;

/**
 * Three big cards on what /auditions is, each with a small looping scene of
 * the tracker in use (intro/IntroScenes.tsx). Desktop: a wide dialog, scene
 * left, words right. Phone: a full height sheet, scene on top. Radix gives
 * the focus trap, Esc and the dialog semantics. The last card hands off to
 * the drop box: `onCapture` focuses it inside the tap (iOS raises the
 * keyboard for nothing else) and returns whether it could; `onCaptured` runs
 * once the dialog has gone.
 */
export function AuditionsIntro({
  open,
  onOpenChange,
  onCapture,
  onCaptured,
  firstOne,
  startAt = 0,
}: {
  startAt?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: () => boolean;
  onCaptured: () => void;
  firstOne: boolean;
}) {
  const [i, setI] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const [hidden, setHidden] = useState(false);
  const capture = useRef(false);
  const reduced = useReducedMotion();
  // Every opening starts on the first card, or the one it was opened from.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setI(startAt);
  }
  const last = i === SLIDES.length - 1;
  const slide = SLIDES[i];
  const Scene = slide.scene;

  // The scenes stop when the tab does. Closed, they are not mounted at all.
  useEffect(() => {
    if (!open) return;
    const sync = () => setHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [open]);

  function change(next: boolean) {
    onOpenChange(next);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setI((n) => Math.min(n + 1, SLIDES.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setI((n) => Math.max(n - 1, 0));
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogPortal>
        <DialogOverlay className={s.scrim} />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(e) => {
            if (!capture.current) return;
            capture.current = false;
            e.preventDefault();
            onCaptured();
          }}
          data-paused={hidden ? "true" : undefined}
          className={`theatre-tokens ${theatreFontVars} ${s.root}`}
        >
          <div className={s.panel}>
            <IntroStage key={i}>
              <Scene />
            </IntroStage>

            <div className={s.copy}>
              <div aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={i}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 1 } : { opacity: 0, y: -6 }}
                    transition={{ type: "tween", duration: reduced ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className={s.step}>({i + 1} of {SLIDES.length})</p>
                    <DialogTitle className={s.title}>{slide.title}</DialogTitle>
                    <DialogDescription className={s.body}>{slide.body}</DialogDescription>
                    <p className="sr-only">{slide.picture}</p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className={s.foot}>
                <span className={s.dots} aria-hidden>
                  {SLIDES.map((_, n) => (
                    <span key={n} className={s.dot} data-on={n === i ? "true" : undefined} />
                  ))}
                </span>
                <div className={s.actions}>
                  {i > 0 && (
                    <button type="button" className={s.back} onClick={() => setI(i - 1)}>
                      Back
                    </button>
                  )}
                  {last ? (
                    <button
                      type="button"
                      className={`${s.pill} bg-primary text-primary-foreground`}
                      onClick={() => {
                        // Close first so the focus trap lets go, then focus in this same tap.
                        capture.current = true;
                        flushSync(() => change(false));
                        onCapture();
                      }}
                    >
                      {firstOne ? "Add my first audition" : "Add an audition"}
                    </button>
                  ) : (
                    <button type="button" className={`${s.pill} ${s.next}`} onClick={() => setI(i + 1)}>
                      Next
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Last in the tab order, so opening lands on Next rather than on the way out. */}
          <DialogClose aria-label="Close" className={s.close}>
            <IconX className="size-4" aria-hidden />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
