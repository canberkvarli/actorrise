"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { theatreFontVars } from "@/lib/fonts/theatre";
import {
  GhostLightSketch,
  MasksSketch,
  MicSketch,
  StageDoorSketch,
} from "@/components/brand/sketches";

/**
 * "How it works" for ScenePartner — a playbill you flip through, in the
 * three-acts style: courier stage directions, serif titles, ghost numerals,
 * one self-drawing sketch per act. Auto-opens once for first-timers
 * (localStorage), reopens from the (?) button in the /practice header.
 */

const SEEN_KEY = "sp_walkthrough_seen_v1";

const ACTS = [
  {
    numeral: "I",
    Sketch: StageDoorSketch,
    direction: "(first: bring your sides.)",
    title: "Upload any script",
    body: "PDF or pasted text. The scenes pull themselves out, characters and all.",
  },
  {
    numeral: "II",
    Sketch: MasksSketch,
    direction: "(then: take your role.)",
    title: "Choose who you are",
    body: "Every scene knows its characters. Say which one is yours.",
  },
  {
    numeral: "III",
    Sketch: MicSketch,
    direction: "(now: run it.)",
    title: "Rehearse out loud",
    body: "Your partner reads every other role, holds your lines, and never misses a cue.",
  },
  {
    numeral: "IV",
    Sketch: GhostLightSketch,
    direction: "(and again, from the top.)",
    title: "Break a leg",
    body: "Run it until it lives in your body. I'll leave the light on.",
  },
];

/**
 * Whether this browser has never been shown the playbill.
 *
 * Read-only, and resolved once per page load into a module-level cache. Both
 * properties matter: the caller reads it through useSyncExternalStore, whose
 * getSnapshot must be pure and must return the same value every time it is
 * asked, or React re-renders forever chasing a moving answer. The older
 * version of this function marked the flag as a side effect of being asked,
 * which is exactly what a snapshot cannot do.
 */
let unseenCache: boolean | null = null;

export function shouldAutoOpenWalkthrough(): boolean {
  if (unseenCache !== null) return unseenCache;
  try {
    unseenCache = !localStorage.getItem(SEEN_KEY);
  } catch {
    unseenCache = false;
  }
  return unseenCache;
}

/** Marking it seen is a separate act, done when the playbill actually opens. */
export function markWalkthroughSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    /* private mode — it will introduce itself again, which is survivable */
  }
  unseenCache = false;
}

export function HowItWorksWalkthrough({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /* Opening it is what counts as having seen it. Synchronising an external
     store (localStorage) from an effect is what effects are for. */
  useEffect(() => {
    if (open) markWalkthroughSeen();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `theatre-tokens` and the faces have to be ON this element. Radix
          portals the dialog to document.body, so it lands OUTSIDE the
          `.theatre-tokens` wrapper on the page that opened it — every
          --t-* var resolved to nothing, which made `background: var(--t-cream)`
          an invalid declaration (transparent) and `font-family: var(--t-display)`
          fall back to whatever body had. The panel rendered as unreadable text
          floating over the blurred page. */}
      <DialogContent
        className={`t-playbill theatre-tokens ${theatreFontVars} max-w-[460px] overflow-hidden border-0 p-0`}
      >
        <DialogTitle className="sr-only">How ScenePartner works</DialogTitle>
        <PlaybillPages onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The pages themselves, and where the page/direction state lives.
 *
 * Inside the dialog rather than outside it, because Radix unmounts the content
 * when the playbill closes — so every open gets a fresh act one for free. The
 * version of this that kept the state in the parent needed an effect resetting
 * it on open, which is a setState at the top of an effect and exactly the
 * cascading render the repo's React rules reject.
 */
function PlaybillPages({ onDone }: { onDone: () => void }) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState(1);
  const last = ACTS.length - 1;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next > last) return;
      setDir(next > page ? 1 : -1);
      setPage(next);
    },
    [page, last],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, go]);

  const act = ACTS[page];

  return (
        <div className="relative px-6 pb-6 pt-10 sm:px-10 sm:pb-8 sm:pt-12 text-center">
          {/* ghost numeral, watching from behind */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`n-${page}`}
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="t-playbill__numeral pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 select-none"
            >
              {act.numeral}
            </motion.span>
          </AnimatePresence>

          <div className="relative min-h-[19rem]">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={page}
                custom={dir}
                initial={{ opacity: 0, x: dir * 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir * -36 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <act.Sketch size={64} delay={0.15} className="t-playbill__glyph" />
                <p className="t-playbill__direction">{act.direction}</p>
                <h2 className="t-playbill__title">{act.title}</h2>
                <p className="t-playbill__body">{act.body}</p>

                {page === last && (
                  <button
                    type="button"
                    onClick={onDone}
                    className="t-playbill__cta"
                  >
                    Start rehearsing
                    <span className="t-playbill__cta-dot" aria-hidden>
                      <IconArrowRight className="size-3.5" />
                    </span>
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* footer: back · dots · next */}
          <div className="t-playbill__footer">
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={page === 0}
              aria-label="Previous"
              className="t-playbill__arrow"
            >
              <IconArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5">
              {ACTS.map((a, i) => (
                <button
                  key={a.numeral}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Act ${a.numeral}`}
                  aria-current={i === page ? "true" : undefined}
                  className="t-playbill__dot"
                  data-active={i === page}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page === last}
              aria-label="Next"
              className="t-playbill__arrow"
            >
              <IconArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
  );
}

export default HowItWorksWalkthrough;
