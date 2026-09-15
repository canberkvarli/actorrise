"use client";

import { useEffect, useRef, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { IconPlus } from "@tabler/icons-react";

import { MonologueText } from "@/components/monologue/MonologueText";
import { anchorFor, type BeatUnit } from "@/lib/beatUnits";
import { cn } from "@/lib/utils";

/**
 * The piece, with a margin you can write in.
 *
 * The old notes box was one textarea under the whole monologue. It has been
 * written in twice in the product's life, by two people, at an average of 30
 * characters — which is not a person failing to write an essay, it is a person
 * marking a spot. A spot needs somewhere to sit, so the note goes where the
 * line is, the way it does on a paper side.
 *
 * The furniture is Cut's: a gutter at the same offset, the same units under
 * it. Read and Cut are now the same page seen twice — here you mark a line,
 * there you trim it — instead of two unrelated screens.
 */

interface BeatReaderProps {
  units: BeatUnit[];
  /** segment_index → note body. */
  beats: Map<number, string>;
  onSave: (segmentIndex: number, body: string, anchorText: string) => void;
  /** Paywalled text is a teaser; there is nothing honest to annotate. */
  disabled?: boolean;
  /** Controlled, so the note button in the working bar can open a line too. */
  openIndex: number | null;
  onOpenChange: (index: number | null) => void;
}

/** Marks each line in the DOM so callers can find the one you are looking at. */
export const BEAT_LINE_ATTR = "data-beat-index";

export function BeatReader({
  units,
  beats,
  onSave,
  disabled,
  openIndex,
  onOpenChange,
}: BeatReaderProps) {
  return (
    <div className="max-w-[62ch]">
      {units.map((u) => (
        <BeatLine
          key={u.index}
          unit={u}
          body={beats.get(u.index) ?? ""}
          open={openIndex === u.index}
          disabled={disabled}
          onOpen={() => onOpenChange(u.index)}
          onClose={() => onOpenChange(null)}
          onSave={(body) => onSave(u.index, body, anchorFor(u.text))}
        />
      ))}
    </div>
  );
}

function BeatLine({
  unit,
  body,
  open,
  disabled,
  onOpen,
  onClose,
  onSave,
}: {
  unit: BeatUnit;
  body: string;
  open: boolean;
  disabled?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (body: string) => void;
}) {
  const marked = body.trim().length > 0;

  return (
    <div
      {...{ [BEAT_LINE_ATTR]: unit.index }}
      className={cn(
        "group relative",
        // Blocks breathe; units inside a block sit together, the way sentences
        // of one speech do on a page.
        unit.startsBlock ? "mt-5 first:mt-0" : "mt-1",
      )}
    >
      <div className="flex items-start gap-3 pr-1">
      {/* The line itself stays plain text — not a button — so it can still be
          selected and copied, which is half of what people do with a side. */}
      <div
        onDoubleClick={() => !disabled && onOpen()}
        className={cn(
          "min-w-0 flex-1 transition-colors",
          unit.kind === "direction" && "italic opacity-70",
          unit.kind === "interjection" && "opacity-80",
        )}
        style={{ textWrap: "pretty" }}
      >
        {unit.kind === "interjection" && unit.speaker && (
          <span className="mr-1.5 text-sm font-semibold not-italic">
            {unit.speaker}:
          </span>
        )}
        <MonologueText text={unit.text} />
      </div>

      {/* The mark, in the margin where a pencil would go. Faint until you go
          near it — and on touch, where there is no hover to go near it with,
          faint but always there. That guard is load-bearing: Tailwind wraps
          group-hover in @media(hover:hover), so a hover-only control is a
          control that does not exist for every phone user. */}
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        disabled={disabled}
        aria-label={marked ? "Edit note on this line" : "Note this line"}
        aria-expanded={open}
        className={cn(
          "mt-1 flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200",
          disabled && "pointer-events-none opacity-0",
          !marked &&
            !open &&
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-50",
        )}
        style={{
          borderColor: marked ? "var(--t-text)" : "var(--t-line-light)",
          background: marked ? "var(--t-gel)" : "transparent",
          color: marked ? "var(--t-text)" : "var(--t-faint)",
        }}
      >
        <IconPlus aria-hidden className="h-3 w-3" strokeWidth={2.6} />
      </button>
      </div>

      <AnimatePresence initial={false}>
        {(open || marked) && (
          <motion.div
            key="note"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {open ? (
              <BeatComposer body={body} onClose={onClose} onSave={onSave} />
            ) : (
              /* Set in the UI face, not the typewriter one. The note is yours;
                 the line above it is the writer's, and they should not look
                 like the same voice. */
              <button
                type="button"
                onClick={onOpen}
                className="mt-1.5 block w-full border-l-2 py-1 pl-3 text-left font-sans text-[13px] leading-relaxed transition-colors"
                style={{
                  borderColor: "var(--t-gel-ink)",
                  color: "var(--t-muted-dark)",
                }}
              >
                {body}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function BeatComposer({
  body,
  onClose,
  onSave,
}: {
  body: string;
  onClose: () => void;
  onSave: (body: string) => void;
}) {
  const [value, setValue] = useState(body);
  const ref = useRef<HTMLTextAreaElement>(null);
  // The last value handed to onSave, so blur-after-Enter doesn't save twice.
  const savedRef = useRef(body);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // Auto-grow. A fixed row count either wastes three lines on "faster" or
  // hides the end of a longer thought.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  const commit = () => {
    if (value.trim() === savedRef.current.trim()) return;
    savedRef.current = value;
    onSave(value);
  };

  return (
    <div
      className="t-m-pop mt-1.5 border-l-2 px-3.5 py-2.5"
      style={{
        borderColor: "var(--t-gel-ink)",
        background: "color-mix(in oklab, var(--t-gel) 14%, transparent)",
      }}
    >
      <p
        className="t-m__mono m-0 text-[11px] uppercase tracking-[0.14em]"
        style={{ color: "var(--t-muted-dark-2)" }}
      >
        beat
      </p>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          commit();
          onClose();
        }}
        onKeyDown={(e) => {
          /* Enter saves and closes; Shift+Enter is a second line. A note this
             short is almost always one line, so the common case should not
             need a reach for the mouse. */
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
            onClose();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setValue(savedRef.current);
            onClose();
          }
        }}
        rows={1}
        placeholder="what changes here?"
        className="t-m__textarea mt-1 w-full resize-none border-0 py-0.5 font-sans text-[13px] leading-relaxed outline-none"
      />
      <p
        className="t-m__mono m-0 text-[11px]"
        style={{ color: "var(--t-faint)" }}
      >
        enter to keep · esc to cancel
      </p>
    </div>
  );
}

export default BeatReader;
