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
    <div className="mx-auto max-w-[62ch]">
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
        "group relative pl-11 pr-1",
        // Blocks breathe; units inside a block sit together, the way sentences
        // of one speech do on a page.
        unit.startsBlock ? "mt-5 first:mt-0" : "mt-1",
      )}
    >
      {/* The gutter. A rule per line rather than a mark only where a note
          already is: an empty margin has to look writable, or nobody finds it.
          Faint until you go near it — and on touch, where there is no hover to
          go near it with, faint but always there. */}
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        disabled={disabled}
        aria-label={marked ? `Edit note on this line` : `Note this line`}
        aria-expanded={open}
        className={cn(
          "absolute left-0 top-0 flex h-7 w-8 items-center justify-center transition-opacity",
          disabled && "pointer-events-none opacity-0",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "block w-[3px] rounded-full transition-all",
            marked
              ? "h-5 bg-primary"
              : "h-4 bg-border opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-60",
          )}
        />
        {!marked && (
          <IconPlus
            aria-hidden
            className="absolute h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70 group-focus-within:opacity-70"
          />
        )}
      </button>

      {/* The line itself stays plain text — not a button — so it can still be
          selected and copied, which is half of what people do with a side. */}
      <div
        onDoubleClick={() => !disabled && onOpen()}
        className={cn(
          "transition-colors",
          unit.kind === "direction" && "italic text-muted-foreground/70",
          unit.kind === "interjection" && "text-muted-foreground",
          marked && "text-foreground",
        )}
      >
        {unit.kind === "interjection" && unit.speaker && (
          <span className="mr-1.5 text-sm font-semibold not-italic">
            {unit.speaker}:
          </span>
        )}
        <MonologueText text={unit.text} />
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
                className="mt-1.5 block w-full border-l-2 border-primary/50 py-0.5 pl-3 text-left font-sans text-[13px] leading-relaxed text-muted-foreground transition-colors hover:text-foreground"
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
    <div className="mt-1.5 border-l-2 border-primary/50 pl-3">
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
        placeholder="what happens here?"
        className="w-full resize-none bg-transparent py-0.5 font-sans text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
      />
      <p className="pb-1 font-sans text-[11px] text-muted-foreground/50">
        enter to keep · esc to cancel
      </p>
    </div>
  );
}

export default BeatReader;
