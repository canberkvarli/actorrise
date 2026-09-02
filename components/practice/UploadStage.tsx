"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowRight, IconChevronDown, IconX } from "@tabler/icons-react";

import {
  CurtainSketch,
  FootlightsSketch,
  MarqueeSketch,
  MasksSketch,
  MicSketch,
  ScriptPagesSketch,
  SpotlightSketch,
  StageDoorSketch,
} from "@/components/brand/sketches";

/**
 * The read-through.
 *
 * Handing in a script is the one moment in ScenePartner worth stopping for, so
 * it happens centre stage rather than in a corner: the room dims, a light comes
 * up on the page, and a different drawing takes the stage as the work moves on.
 * The sketches redraw themselves on every phase change — that stroke animation
 * is the transition, so nothing needs a spinner to look alive.
 *
 * Extraction can run for minutes, so the stage never traps anyone: escape, the
 * backdrop, or the chevron drops it back to the bottom bar and the app is usable
 * again while the script finishes.
 */

type Props = {
  scanning: boolean;
  fileName: string;
  steps: { group: string; detail: string }[];
  extractionDone: boolean;
  doneInfo: { id: number; scenes: number } | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onCancel: () => void;
  onView: () => void;
  onMinimize: () => void;
};

/** Which drawing holds the stage for each phase of the work. */
const PHASE_SKETCH: { match: string; Sketch: typeof MasksSketch }[] = [
  { match: "Opening the script", Sketch: StageDoorSketch },
  { match: "Reading through every page", Sketch: ScriptPagesSketch },
  { match: "Learning who the characters are", Sketch: MasksSketch },
  { match: "Analyzing", Sketch: MasksSketch },
  { match: "Mapping out the acts and scenes", Sketch: MarqueeSketch },
  { match: "Pulling every line of dialogue", Sketch: MicSketch },
  { match: "Figuring out the tone", Sketch: SpotlightSketch },
  { match: "Cleaning up dialogue", Sketch: SpotlightSketch },
  { match: "Assembling your rehearsal scenes", Sketch: FootlightsSketch },
];

function sketchFor(phase: string) {
  return PHASE_SKETCH.find((p) => phase.startsWith(p.match))?.Sketch ?? ScriptPagesSketch;
}

export function UploadStage({
  scanning,
  fileName,
  steps,
  extractionDone,
  doneInfo,
  expanded,
  onToggleExpanded,
  onCancel,
  onView,
  onMinimize,
}: Props) {
  const reduce = useReducedMotion();

  const phase = scanning
    ? "Opening the script"
    : steps[steps.length - 1]?.group ?? "Opening the script";
  const Sketch = doneInfo ? SpotlightSketch : sketchFor(phase);
  const headline = doneInfo ? "Ready when you are" : phase;
  const sceneCount = doneInfo
    ? `${doneInfo.scenes} scene${doneInfo.scenes === 1 ? "" : "s"} to rehearse`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      onClick={onMinimize}
    >
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg border border-border bg-card shadow-2xl shadow-black/30"
      >
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Keep working while this runs"
          className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconChevronDown className="h-4 w-4" />
        </button>

        {/* The curtain goes up only once, on the payoff. */}
        <AnimatePresence>
          {doneInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-center overflow-hidden pt-6 text-primary/70"
            >
              <CurtainSketch width={220} height={44} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col items-center px-8 pb-7 pt-9 text-center">
          {/* Ghost light: a slow warm breath behind whichever drawing is up. */}
          <div className="relative flex h-28 w-28 items-center justify-center">
            {!reduce && (
              <motion.span
                aria-hidden
                animate={{ opacity: [0.25, 0.6, 0.25], scale: [0.92, 1.06, 0.92] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full bg-primary/20 blur-2xl"
              />
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={doneInfo ? "done" : phase}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86, rotate: -4 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08, rotate: 3 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="relative text-primary"
              >
                <Sketch size={84} />
              </motion.div>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            <motion.h2
              key={headline}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="mt-6 font-brand text-2xl leading-tight text-foreground"
            >
              {headline}
            </motion.h2>
          </AnimatePresence>

          <p className="mt-2 max-w-sm font-typewriter text-xs text-muted-foreground">
            {sceneCount ?? fileName}
          </p>

          {/* The trail of what is already done, newest nearest. */}
          {!doneInfo && steps.length > 1 && (
            <div className="mt-6 w-full">
              <div
                className={`space-y-1 overflow-y-auto scrollbar-thin ${expanded ? "max-h-40" : "max-h-16"}`}
              >
                {(expanded ? steps : steps.slice(-3)).map((step, i, shown) => (
                  <motion.p
                    key={`${step.group}_${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: i === shown.length - 1 && !extractionDone ? 0.7 : 0.35 }}
                    className="truncate text-xs text-muted-foreground"
                  >
                    {step.group}
                  </motion.p>
                ))}
              </div>
              <button
                type="button"
                onClick={onToggleExpanded}
                className="mt-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {expanded ? "Less" : "Every step"}
              </button>
            </div>
          )}

          <div className="mt-7 flex items-center gap-3">
            {doneInfo ? (
              <motion.button
                type="button"
                onClick={onView}
                initial={reduce ? {} : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open the script
                <IconArrowRight className="h-4 w-4" />
              </motion.button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onMinimize}
                  className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Keep working
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex h-10 items-center gap-1 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <IconX className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default UploadStage;
