"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconX } from "@tabler/icons-react";

import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { useT, type MessageKey } from "@/lib/i18n";
import { IntroStage, SceneCapture, SceneNotes, ScenePrep } from "./intro/IntroScenes";
import s from "./intro/intro.module.css";

/** Each card's words are dictionary keys; t() them where they render. */
export const SLIDES: readonly { title: MessageKey; body: MessageKey; scene: typeof SceneCapture; picture: MessageKey }[] = [
  {
    title: "appAuditionsIntro.s1Title",
    body: "appAuditionsIntro.s1Body",
    scene: SceneCapture,
    picture: "appAuditionsIntro.s1Picture",
  },
  {
    title: "appAuditionsIntro.s2Title",
    body: "appAuditionsIntro.s2Body",
    scene: ScenePrep,
    picture: "appAuditionsIntro.s2Picture",
  },
  {
    title: "appAuditionsIntro.s3Title",
    body: "appAuditionsIntro.s3Body",
    scene: SceneNotes,
    picture: "appAuditionsIntro.s3Picture",
  },
];

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
  const t = useT();
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
                    <p className={s.step}>{t("appAuditionsIntro.step", { n: i + 1, total: SLIDES.length })}</p>
                    <DialogTitle className={s.title}>{t(slide.title)}</DialogTitle>
                    <DialogDescription className={s.body}>{t(slide.body)}</DialogDescription>
                    <p className="sr-only">{t(slide.picture)}</p>
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
                      {t("appAuditionsIntro.back")}
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
                      {firstOne ? t("appAuditionsIntro.addFirst") : t("appAuditionsIntro.add")}
                    </button>
                  ) : (
                    <button type="button" className={`${s.pill} ${s.next}`} onClick={() => setI(i + 1)}>
                      {t("appAuditionsIntro.next")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Last in the tab order, so opening lands on Next rather than on the way out. */}
          <DialogClose aria-label={t("appAuditionsIntro.close")} className={s.close}>
            <IconX className="size-4" aria-hidden />
          </DialogClose>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
