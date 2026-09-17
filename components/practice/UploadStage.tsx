"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { IconArrowRight, IconChevronDown, IconX } from "@tabler/icons-react";

import { theatreFontVars } from "@/lib/fonts/theatre";
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
 *
 * TWO things changed here.
 *
 * It speaks the theatre's tokens now (`theatre-tokens`, the three faces, the
 * --t-* palette) instead of bg-card/border-border/text-primary, so it reads as
 * the same room as the shelf it was opened from and follows the theme properly
 * in both directions. It carries the tokens itself because UploadProvider sits
 * at the platform-layout level, outside any page's `.theatre-*` scope.
 *
 * And it says something. The old card showed one phase headline — "Taking your
 * script" — over the filename and three grey truncated lines, so a wait that
 * can run for minutes had nothing in it to read and no sense of how far along
 * it was. The work has a known running order, so the card prints it: every
 * pass, ticked as it goes, the current one lit, with the server's own detail
 * line under it. That is a call sheet, and a call sheet is the thing an actor
 * already knows how to read.
 *
 * Extraction can run for minutes, so the stage never traps anyone: escape, the
 * backdrop, or the chevron drops it back to the bottom bar and the app is
 * usable again while the script finishes.
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

/**
 * The running order, and the drawing that holds the stage for each pass.
 *
 * `match` is a prefix of what the server calls the phase; `label` is what the
 * card prints. The server's names are accurate and long ("Learning who the
 * characters are"); on a list of nine they become a wall, so the list gets the
 * short form and the headline keeps the sentence.
 */
const RUN_OF_SHOW: { match: string; label: string; Sketch: typeof MasksSketch }[] = [
  { match: "Taking your script", label: "Taking it in", Sketch: StageDoorSketch },
  { match: "Uploading file", label: "Taking it in", Sketch: StageDoorSketch },
  { match: "Opening the script", label: "Opening it", Sketch: StageDoorSketch },
  { match: "Reading through every page", label: "Reading every page", Sketch: ScriptPagesSketch },
  { match: "Learning who the characters are", label: "Learning the characters", Sketch: MasksSketch },
  { match: "Analyzing", label: "Learning the characters", Sketch: MasksSketch },
  { match: "Mapping out the acts and scenes", label: "Mapping acts and scenes", Sketch: MarqueeSketch },
  { match: "Pulling every line of dialogue", label: "Pulling the dialogue", Sketch: MicSketch },
  { match: "Figuring out the tone", label: "Finding the tone", Sketch: SpotlightSketch },
  { match: "Cleaning up dialogue", label: "Finding the tone", Sketch: SpotlightSketch },
  { match: "Assembling your rehearsal scenes", label: "Setting your scenes", Sketch: FootlightsSketch },
];

/** The list the card prints: the labels above, in order, without repeats. */
const BILL = RUN_OF_SHOW.reduce<string[]>((acc, p) => {
  if (!acc.includes(p.label)) acc.push(p.label);
  return acc;
}, []);

function entryFor(phase: string) {
  return RUN_OF_SHOW.find((p) => phase.startsWith(p.match));
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

  const last = steps[steps.length - 1];
  const phase = scanning ? "Opening the script" : last?.group ?? "Taking your script";
  const entry = entryFor(phase);
  const Sketch = doneInfo ? SpotlightSketch : entry?.Sketch ?? ScriptPagesSketch;
  const headline = doneInfo ? "Ready when you are" : phase;

  /* Where we are on the bill. -1 while the phase is one the list does not know
     about, which keeps every row "to come" rather than guessing. `extractionDone`
     lands before the id does, and in that gap every pass really is finished —
     without it the last row sat blinking after the work had stopped. */
  const atIndex =
    doneInfo || extractionDone ? BILL.length : entry ? BILL.indexOf(entry.label) : -1;

  /* The server's own sentence for this pass, when it differs from the name of
     the pass. This is the line that actually changes while you watch. */
  const detail = last?.detail && last.detail !== last.group ? last.detail : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`theatre-tokens theatre-stage ${theatreFontVars} fixed inset-0 z-[9990] flex items-center justify-center overflow-y-auto p-4`}
      style={{ background: "color-mix(in oklab, var(--t-ink) 82%, transparent)", backdropFilter: "blur(8px)" }}
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
        className="relative my-auto w-full max-w-[520px] rounded-lg border-[1.5px]"
        style={{
          background: "var(--t-paper)",
          color: "var(--t-text)",
          borderColor: "var(--t-text)",
          boxShadow: "12px 12px 0 var(--t-gel), 0 40px 100px -30px rgb(0 0 0 / 0.8)",
        }}
      >
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Keep working while this runs"
          className="absolute right-2.5 top-2.5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--t-muted-dark-2)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-muted-dark-2)")}
        >
          <IconChevronDown className="h-4 w-4" />
        </button>

        {/* The curtain goes up only once, on the payoff. */}
        <AnimatePresence>
          {doneInfo && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center overflow-hidden pt-7"
              style={{ color: "var(--t-gel-ink)" }}
            >
              <CurtainSketch width={220} height={44} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-7 pb-6 pt-8 sm:px-9">
          {/* The head: the drawing, then what is happening, then which script. */}
          <div className="flex items-start gap-5">
            <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
              {!reduce && !doneInfo && (
                <motion.span
                  aria-hidden
                  animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.9, 1.08, 0.9] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-full blur-2xl"
                  style={{ background: "var(--t-gel)" }}
                />
              )}
              <AnimatePresence mode="wait">
                <motion.div
                  key={doneInfo ? "done" : entry?.label ?? phase}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.86, rotate: -4 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08, rotate: 3 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  className="relative"
                  style={{ color: "var(--t-gel-ink)" }}
                >
                  <Sketch size={64} />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <p
                className="m-0 text-[12px] italic tracking-[0.08em]"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
              >
                {doneInfo ? "(that's the read-through.)" : "(reading it through.)"}
              </p>
              <AnimatePresence mode="wait">
                <motion.h2
                  key={headline}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="m-0 mt-1.5 font-normal leading-[1.05] tracking-[-0.02em]"
                  style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.55rem, 4vw, 2rem)" }}
                >
                  {headline}
                </motion.h2>
              </AnimatePresence>
              <p
                className="m-0 mt-2 truncate text-[12px]"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark)" }}
              >
                {doneInfo
                  ? `${doneInfo.scenes} scene${doneInfo.scenes === 1 ? "" : "s"} to rehearse`
                  : fileName}
              </p>
            </div>
          </div>

          {/* The bill: every pass, in order, ticked as it goes. */}
          {!doneInfo && (
            <ul className="mt-6 flex list-none flex-col gap-0 p-0">
              {BILL.map((label, i) => {
                const done = atIndex > i;
                const now = atIndex === i;
                return (
                  <li
                    key={label}
                    className="flex items-center gap-3 py-[5px]"
                    style={{ opacity: done ? 0.5 : now ? 1 : 0.32 }}
                  >
                    <span
                      aria-hidden
                      className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
                      style={{
                        borderColor: done || now ? "var(--t-gel-ink)" : "var(--t-line-light)",
                        background: done ? "var(--t-gel-ink)" : "transparent",
                        color: "var(--t-on-gel-ink)",
                      }}
                    >
                      {done ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : now && !reduce ? (
                        <motion.span
                          className="block size-[7px] rounded-full"
                          style={{ background: "var(--t-gel-ink)" }}
                          animate={{ opacity: [0.35, 1, 0.35] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                        />
                      ) : null}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-[13px]"
                      style={{
                        fontFamily: "var(--t-direction)",
                        fontWeight: now ? 700 : 400,
                        color: "var(--t-text)",
                      }}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* The one line that actually changes while you watch. */}
          {!doneInfo && detail && (
            <AnimatePresence mode="wait">
              <motion.p
                key={detail}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="m-0 mt-4 border-l-[3px] py-1 pl-3 text-[13px] leading-snug"
                style={{ borderColor: "var(--t-gel-ink)", color: "var(--t-muted-dark)" }}
              >
                {detail}
              </motion.p>
            </AnimatePresence>
          )}

          {/* Every step the server has sent, for anyone who wants the whole log. */}
          {!doneInfo && steps.length > 1 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={onToggleExpanded}
                className="text-[12px] italic tracking-[0.06em] underline underline-offset-4 transition-colors"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
              >
                {expanded ? "hide the log" : "every step"}
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mt-3 max-h-40 space-y-1 overflow-y-auto border-l pl-3"
                      style={{ borderColor: "var(--t-line-light)" }}
                    >
                      {steps.map((step, i) => (
                        <p
                          key={`${step.group}_${i}`}
                          className="m-0 truncate text-[11px]"
                          style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
                        >
                          {step.detail || step.group}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* The way on, or the two ways out. */}
          <div
            className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t-[1.5px] border-dashed pt-4"
            style={{ borderColor: "color-mix(in oklab, var(--t-text) 22%, transparent)" }}
          >
            {doneInfo ? (
              <motion.button
                type="button"
                onClick={onView}
                initial={reduce ? {} : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                whileHover={{ scale: 1.03, rotate: -1 }}
                className="inline-flex h-12 items-center justify-between gap-3 rounded-full pl-6 pr-2 text-[15px] font-bold"
                style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
              >
                Open the script
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full"
                  style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
                >
                  <IconArrowRight className="h-4 w-4" />
                </span>
              </motion.button>
            ) : (
              <>
                {/* The important one. This can run for minutes and the app is
                    perfectly usable while it does; it used to be a chevron in
                    the corner that nobody would read as "carry on". */}
                <button
                  type="button"
                  onClick={onMinimize}
                  className="t-mem__ghost"
                >
                  <IconChevronDown className="h-4 w-4" />
                  Keep working while this runs
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex items-center gap-1.5 text-[12px] italic tracking-[0.06em] underline underline-offset-4 transition-colors"
                  style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
                >
                  <IconX className="h-3 w-3" />
                  stop
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
