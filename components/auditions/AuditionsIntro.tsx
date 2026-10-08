"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconX } from "@tabler/icons-react";

import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";

const SLIDES = [
  {
    title: "Every audition, one rail.",
    body: "Paste the casting email or drop the breakdown and I'll read it into a ticket. Or fill it in yourself, that's always free.",
  },
  {
    title: "Each one opens a prep room.",
    body: "Run your sides with ScenePartner, pick the piece you're bringing, and see what to pack. It ticks off as you go.",
  },
  {
    title: "I'll keep you on it.",
    body: "A note three days out, one the night before, and one the morning after so you can log how it went. Add the calendar feed and they show up next to everything else.",
  },
] as const;

/**
 * Three cards on what /auditions is. Not a followspot tour: one centred card on
 * the same dark stage the tours use (`.theatre-tour` tokens, so the card flips
 * with the theme and the house stays dark). Radix gives the focus trap, Esc and
 * the dialog semantics. The last card hands off to the drop box: `onCapture`
 * focuses it inside the tap (iOS raises the keyboard for nothing else) and
 * returns whether it could; `onCaptured` runs once the dialog has gone.
 */
export function AuditionsIntro({
  open,
  onOpenChange,
  onCapture,
  onCaptured,
  firstOne,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: () => boolean;
  onCaptured: () => void;
  firstOne: boolean;
}) {
  const [i, setI] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const capture = useRef(false);
  const reduced = useReducedMotion();
  // Every opening starts on the first card.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setI(0);
  }
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

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

  const quiet = "-m-2 flex min-h-11 items-center p-2 text-xs italic tracking-[0.06em] underline-offset-4 hover:underline";

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogPortal>
        {/* The house, dark in both themes, like the tours. */}
        <DialogOverlay className="bg-[oklch(0.08_0.01_50/0.78)]" />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          onCloseAutoFocus={(e) => {
            if (!capture.current) return;
            capture.current = false;
            e.preventDefault();
            onCaptured();
          }}
          className={`theatre-tokens theatre-tour ${theatreFontVars} fixed left-1/2 top-1/2 z-[10071] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 outline-none`}
        >
          <div
            className="relative max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-lg border-[1.5px] px-5 pb-4 pt-4 sm:px-6 sm:pt-5"
            style={{
              background: "var(--card)",
              color: "var(--t-text)",
              borderColor: "var(--t-text)",
              boxShadow: "8px 8px 0 var(--t-gel), 0 24px 60px -20px rgb(0 0 0 / 0.7)",
            }}
          >
            <div className="flex items-center gap-3">
              <p
                className="m-0 text-xs italic tracking-[0.08em]"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
              >
                {i + 1} of {SLIDES.length}
              </p>
              <span className="flex gap-1.5" aria-hidden>
                {SLIDES.map((_, n) => (
                  <span
                    key={n}
                    className="size-1.5 rounded-full transition-colors"
                    style={{ background: n === i ? "var(--t-text)" : "color-mix(in oklab, var(--t-text) 25%, transparent)" }}
                  />
                ))}
              </span>
            </div>

            <div aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={i}
                initial={reduced ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 1 } : { opacity: 0, x: -12 }}
                transition={{ type: "tween", duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="min-h-[136px] pr-6"
              >
                <DialogTitle
                  className="mt-2 font-normal leading-tight tracking-[-0.02em]"
                  style={{ fontFamily: "var(--t-display)", fontSize: 26 }}
                >
                  {s.title}
                </DialogTitle>
                <DialogDescription className="mt-2 text-sm leading-normal" style={{ color: "var(--t-muted-dark)" }}>
                  {s.body}
                </DialogDescription>
              </motion.div>
            </AnimatePresence>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4" style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}>
                {i > 0 && (
                  <button type="button" className={quiet} onClick={() => setI(i - 1)}>
                    back
                  </button>
                )}
                {!last && (
                  <button type="button" className={`${quiet} underline`} onClick={() => change(false)}>
                    skip
                  </button>
                )}
              </div>
              {last ? (
                <button
                  type="button"
                  className="bg-primary text-primary-foreground inline-flex h-11 items-center rounded-full px-5 text-sm font-bold"
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
                <button
                  type="button"
                  onClick={() => setI(i + 1)}
                  className="inline-flex h-11 items-center gap-2.5 rounded-full pl-5 pr-1.5 text-sm font-bold"
                  style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
                >
                  Next
                  <span
                    className="inline-flex size-8 items-center justify-center rounded-full"
                    style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
              )}
            </div>
          </div>
          {/* Outside the scrolling panel, so a short landscape screen never scrolls it away. */}
          <DialogClose
            aria-label="Close"
            className="absolute right-1.5 top-1.5 z-10 flex size-11 items-center justify-center opacity-60 transition-opacity hover:opacity-100"
            style={{ color: "var(--t-text)" }}
          >
            <IconX className="size-4" aria-hidden />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
