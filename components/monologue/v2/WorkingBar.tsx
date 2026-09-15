"use client";

import { forwardRef } from "react";
import { motion } from "framer-motion";
import {
  IconBookmark,
  IconBulb,
  IconBulbFilled,
  IconEdit,
  IconNote,
  IconRepeat,
} from "@tabler/icons-react";

import { InstantTooltip } from "@/components/ui/instant-tooltip";

/**
 * The working bar.
 *
 * It follows you down the piece, so switching how you're looking at the text
 * never means scrolling back up, and the marks you can make on it are never
 * scrolled away.
 *
 * A pill on a hard shadow rather than the bordered strip it used to be: this
 * row is furniture the actor handles, and it should sit ON the page rather
 * than be ruled off from it. The page fades out underneath it (`t-m__barfade`)
 * so a line scrolling under dissolves instead of being guillotined.
 */

export type Mode = "read" | "cut" | "copy";

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "read", label: "Read", hint: "The piece as written" },
  { id: "cut", label: "Cut", hint: "Trim it to an audition length" },
  { id: "copy", label: "Copy", hint: "Print or copy your sides" },
];

interface WorkingBarProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  /** Cut and Copy work on `text`, which is a teaser once the reads are spent. */
  readOnly?: boolean;
  noteCount: number;
  hasNotes: boolean;
  onNote: () => void;
  onMemorize: () => void;
  memorized: boolean;
  onToggleMemorized: () => void;
  saved: boolean;
  onToggleSaved: () => void;
  onEdit?: () => void;
}

/** A 40px round control in the bar's right-hand cluster. */
function BarButton({
  label,
  onClick,
  children,
  pressed,
  align,
  active,
  filled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  pressed?: boolean;
  align?: "end";
  /** Carries meaning (a note exists, it's off book) — takes the ink colour. */
  active?: boolean;
  /** Saved: the control itself goes gel, the way a stamped bookmark does. */
  filled?: boolean;
}) {
  return (
    <InstantTooltip label={label} align={align}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={label}
        className="flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300"
        style={{
          background: filled ? "var(--t-gel)" : "transparent",
          color: active || filled ? "var(--t-text)" : "var(--t-muted-dark-2)",
        }}
      >
        {children}
      </button>
    </InstantTooltip>
  );
}

export const WorkingBar = forwardRef<HTMLDivElement, WorkingBarProps>(
  function WorkingBar(
    {
      mode,
      onModeChange,
      readOnly,
      noteCount,
      hasNotes,
      onNote,
      onMemorize,
      memorized,
      onToggleMemorized,
      saved,
      onToggleSaved,
      onEdit,
    },
    ref,
  ) {
    const modes = readOnly ? MODES.filter((m) => m.id === "read") : MODES;

    return (
      /* pointer-events-none on the fade, auto on the pill: the band spans the
         full column width and would otherwise eat clicks on the text beside a
         narrow pill.

         It sticks to top:0 and carries its own tall top padding rather than
         sitting at top-16 — and that padding is the whole point. The band is
         82% opaque page colour, so the padding is what gives it the height to
         cover the strip the platform nav floats over. At pt-3 the bar cleared
         the nav but the band did not, and every line of the piece scrolled up
         into the gap between them and sat there, legible, behind the nav. */
      <div
        ref={ref}
        className="t-m__barfade pointer-events-none sticky top-0 z-30 -mx-5 px-5 pb-2.5 pt-[72px] sm:-mx-6 sm:px-6 sm:pt-[88px]"
      >
        <div
          className="t-m__hard pointer-events-auto flex items-center justify-between gap-3 rounded-full border-[1.5px] p-1.5"
          style={{
            borderColor: "var(--t-text)",
            background: "var(--t-paper)",
          }}
        >
          <div
            role="tablist"
            aria-label="How to view this piece"
            className="inline-flex gap-0.5"
          >
            {modes.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                title={m.hint}
                onClick={() => onModeChange(m.id)}
                className="relative h-10 rounded-full px-4 text-sm font-bold transition-transform duration-300 hover:scale-[1.04]"
                style={{
                  color: mode === m.id ? "var(--t-on-text)" : "var(--t-muted-dark-2)",
                }}
              >
                {mode === m.id && (
                  <motion.span
                    layoutId="monologue-mode-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ background: "var(--t-text)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>

          <div className="inline-flex flex-shrink-0 items-center gap-0.5">
            <BarButton
              label={noteCount > 0 ? `Your notes · ${noteCount}` : "Note this line"}
              onClick={onNote}
              active={noteCount > 0 || hasNotes}
            >
              <IconNote className="h-[18px] w-[18px]" />
            </BarButton>

            {!readOnly && (
              <BarButton label="Memorize · line by line" onClick={onMemorize}>
                <IconRepeat className="h-[18px] w-[18px]" />
              </BarButton>
            )}

            {/* Off-book status. Distinct from the Memorize drill beside it —
                this one only records where you are, it doesn't go anywhere. */}
            <BarButton
              label={memorized ? "Off book — tap to unmark" : "Mark as off book"}
              onClick={onToggleMemorized}
              pressed={memorized}
              active={memorized}
            >
              {memorized ? (
                <IconBulbFilled
                  className="h-[18px] w-[18px]"
                  style={{ color: "var(--t-orange-deep)" }}
                />
              ) : (
                <IconBulb className="h-[18px] w-[18px]" />
              )}
            </BarButton>

            {/* Last in the row, so its label hangs off the right edge of the
                reading column — and on a phone that edge is the screen.
                Right-aligned it can only grow inwards. */}
            <BarButton
              label={saved ? "In your collection" : "Save to collection"}
              onClick={onToggleSaved}
              pressed={saved}
              filled={saved}
              align="end"
            >
              <IconBookmark
                className={`h-[18px] w-[18px] ${saved ? "fill-current" : ""}`}
              />
            </BarButton>

            {onEdit && (
              <BarButton label="Edit monologue" onClick={onEdit}>
                <IconEdit className="h-[18px] w-[18px]" />
              </BarButton>
            )}
          </div>
        </div>
      </div>
    );
  },
);
