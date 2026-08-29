"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

/** True on the visit where the walkthrough should introduce itself. */
export function shouldAutoOpenWalkthrough(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return false;
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function HowItWorksWalkthrough({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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

  // Fresh playbill every open.
  useEffect(() => {
    if (open) {
      setPage(0);
      setDir(1);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(page + 1);
      if (e.key === "ArrowLeft") go(page - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, page, go]);

  const act = ACTS[page];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">How ScenePartner works</DialogTitle>

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
              className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 select-none font-brand text-[7rem] leading-none text-foreground/[0.05]"
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
                <act.Sketch size={72} delay={0.15} className="text-muted-foreground/70" />
                <p className="mt-6 font-typewriter text-xs italic tracking-wide text-muted-foreground/70">
                  {act.direction}
                </p>
                <h2 className="mt-2 font-brand text-2xl sm:text-[1.7rem] font-medium tracking-tight text-foreground">
                  {act.title}
                </h2>
                <p className="mt-3 max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
                  {act.body}
                </p>

                {page === last && (
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="mt-6 inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#B03000]"
                  >
                    Start rehearsing
                    <IconArrowRight className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* footer: back · dots · next */}
          <div className="mt-2 flex items-center justify-between border-t border-border/50 pt-4">
            <button
              type="button"
              onClick={() => go(page - 1)}
              disabled={page === 0}
              aria-label="Previous"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-0"
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
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === page ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/25 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => go(page + 1)}
              disabled={page === last}
              aria-label="Next"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-0"
            >
              <IconArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default HowItWorksWalkthrough;
