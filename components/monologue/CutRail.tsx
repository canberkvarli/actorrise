"use client";

import { formatClock } from "@/lib/estimateDuration";

/**
 * The shared vocabulary for choosing an audition cut.
 *
 * Two screens let you trim a piece — the Cut tab and Memorize's trim mode —
 * and they had different segmentation and different visuals, so "a line"
 * and "selected" each meant two things depending where you were standing.
 *
 * The old selection was `border-l-2` plus `bg-primary/[0.06]`: a six percent
 * wash, which is invisible on paper. Worse, a line only took any styling once
 * BOTH ends were chosen, so tapping the first line changed nothing at all on
 * screen — the single most common complaint about the feature was simply that
 * you could not tell it had registered.
 */

/** in = inside the committed cut. preview = would be, if you tapped here. */
export type CutLineState = "in" | "out" | "preview" | "start-only" | "neutral";

/** The limits actors are actually given. Anything longer is a showcase. */
const TARGETS = [60, 90, 120];

/**
 * How long the cut runs against the whole piece, and against the limits a
 * room gives you.
 *
 * This is the "how much can I still take?" question. A bare clock answers
 * "how long is it now", which is a different and less useful question — you
 * cannot tell from it whether you have thirty seconds of room left or are
 * forty over.
 */
export function CutMeter({
  cutSeconds,
  fullSeconds,
  previewSeconds,
}: {
  cutSeconds: number;
  fullSeconds: number;
  /** Live length while hovering a candidate end line. */
  previewSeconds?: number | null;
}) {
  const shown = previewSeconds ?? cutSeconds;
  const pct = fullSeconds > 0 ? Math.min(100, (shown / fullSeconds) * 100) : 0;
  const ticks = TARGETS.filter((t) => t < fullSeconds);
  const trimmed = Math.max(0, fullSeconds - shown);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-typewriter text-3xl tabular-nums leading-none text-foreground">
          {formatClock(shown)}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {trimmed > 0 ? (
            <>
              {formatClock(trimmed)} trimmed
              <br />
              of {formatClock(fullSeconds)}
            </>
          ) : (
            <>the whole piece</>
          )}
        </span>
      </div>

      {/* The bar is the full piece; the fill is your cut. Ticks are the limits
          you get given, so you can see the room left rather than compute it. */}
      <div className="relative mt-3 h-2 w-full bg-muted">
        <div
          className={`h-full transition-[width] duration-200 ${
            previewSeconds != null ? "bg-primary/50" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute top-0 h-2 w-px bg-foreground/40"
            style={{ left: `${(t / fullSeconds) * 100}%` }}
          />
        ))}
      </div>

      <div className="relative mt-1 h-4">
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute -translate-x-1/2 font-typewriter text-[10px] text-muted-foreground"
            style={{ left: `${(t / fullSeconds) * 100}%` }}
          >
            {formatClock(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One selectable unit of the piece.
 *
 * Endpoints are marked IN and OUT in the margin rather than by weight alone.
 * A bold line among other lines is a difference you have to hunt for; a
 * labelled edge is one you can see without looking for it.
 */
export function CutLine({
  text,
  state,
  edge,
  onClick,
  onHover,
}: {
  text: string;
  state: CutLineState;
  /** "in" | "out" — draws the margin tab. */
  edge?: "in" | "out" | null;
  onClick: () => void;
  onHover?: () => void;
}) {
  const selected =
    state === "in" || state === "preview" || state === "start-only" || state === "neutral";
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      onFocus={onHover}
      aria-pressed={state === "in" || state === "start-only"}
      className="group relative block w-full py-0.5 pl-12 pr-3 text-left transition-colors"
    >
      {/* The rail. Continuous down the range because the cut is one passage,
          not a run of separately-ticked items. */}
      <span
        aria-hidden
        className={`absolute bottom-0 left-9 top-0 w-[3px] transition-colors ${
          state === "in" || state === "start-only"
            ? "bg-primary"
            : state === "neutral"
              ? "bg-transparent group-hover:bg-primary/40"
            : state === "preview"
              ? "bg-primary/45"
              : "bg-transparent group-hover:bg-border"
        }`}
      />
      {edge && (
        <span
          aria-hidden
          className="absolute left-0 top-1 font-typewriter text-[10px] uppercase tracking-[0.14em] text-primary"
        >
          {edge}
        </span>
      )}
      <span
        className={`transition-colors ${
          selected
            ? "text-foreground"
            : "text-muted-foreground/45 group-hover:text-muted-foreground"
        }`}
      >
        {text}
      </span>
    </button>
  );
}
