"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, motion, useDragControls, useReducedMotion } from "framer-motion";
import { IconDots, IconFlag } from "@tabler/icons-react";
import { Trash2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getGenreInkColor, getGenreSpineColor } from "@/lib/genreColors";
import type { UserScript } from "@/hooks/useScripts";
import { entrance } from "@/lib/motion";

interface PracticeLibraryRailProps {
  /** Ordered scripts (user scripts first, demo last). */
  scripts: UserScript[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Opens the delete confirm for a user script. */
  onRequestDelete: (script: UserScript) => void;
  /** Flags a script whose scenes look wrong or missing. */
  onReport: (script: UserScript) => void;
  /**
   * `row` scrolls sideways (the old full-width shelf). `column` stacks in the
   * side rail beside the stage, where each card takes the rail's full width.
   */
  orientation?: "row" | "column";
  /**
   * Save a new arrangement. Called once when a drag settles, or on each
   * keyboard move — not on every card the drag passes over.
   */
  onReorder?: (scriptIds: number[]) => void;
}

/**
 * The script shelf. A bound playscript per row rather than a row in a list:
 * a cloth binding down the spine in the genre's colour, and a cover with the
 * title set in the display face.
 *
 * The actor arranges it. Newest-first is a filing order, and it pushed the
 * script someone is actually working toward an audition further down every
 * time they brought in anything else. Cards are dragged by the thread in the
 * binding rather than by the card itself, so the card stays a button, the page
 * still scrolls under a thumb, and the handle can take arrow keys for anyone
 * not using a mouse.
 *
 * Samples are not draggable and stay pinned below: they are the same rows for
 * every actor, so there is no per-actor place to keep them.
 */
export function PracticeLibraryRail({
  scripts,
  selectedId,
  onSelect,
  onRequestDelete,
  onReport,
  orientation = "row",
  onReorder,
}: PracticeLibraryRailProps) {
  const column = orientation === "column";
  const mine = scripts.filter((s) => !s.is_sample);
  const pinned = scripts.filter((s) => s.is_sample);
  const canArrange = Boolean(onReorder) && mine.length > 1;

  // The order on screen while a drag is in flight. framer-motion reports a move
  // the moment a card crosses another, which would be one request per card
  // passed over, so the arrangement is held here until the drag settles.
  const [dragOrder, setDragOrder] = useState<number[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const reduceMotion = useReducedMotion();

  const propIds = mine.map((s) => s.id);
  const propKey = propIds.join(",");
  const [seenKey, setSeenKey] = useState(propKey);
  if (seenKey !== propKey) {
    // The list changed underneath us: the save landing, an upload, a delete.
    // Whatever we were holding is stale, so follow the list again. Adjusting
    // during render rather than in an effect keeps this to one pass and never
    // paints the old order first.
    setSeenKey(propKey);
    setDragOrder(null);
  }

  const order = dragOrder ?? propIds;
  const byId = new Map(mine.map((s) => [s.id, s]));
  const arranged = order
    .map((id) => byId.get(id))
    .filter((s): s is UserScript => Boolean(s));

  // Saving is on a timer rather than on the end of the drag. framer-motion
  // reports a move the moment one card crosses another, so saving there would
  // be a request per card passed over; but its drag-end doesn't always arrive
  // (a pointer released outside the window, a cancelled gesture), and an
  // arrangement that looks saved and isn't is the worse failure. The timer
  // coalesces a whole drag into one request and cannot be skipped.
  const timer = useRef<number | null>(null);
  const pending = useRef<number[] | null>(null);

  const flush = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next) onReorder?.(next);
  };

  // The order the group hands us during a drag is always the current one. The
  // handlers framer-motion captured when the drag began are not: reading the
  // order from one of those saved the arrangement from before the drag, so the
  // card stayed where it was dropped and the shelf came back in its old order
  // on the next load. So the group is the only thing that reports a move, and
  // the timer is the only thing that saves one.
  const moveTo = (next: number[]) => {
    setDragOrder(next);
    pending.current = next;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 300);
  };

  // Leaving the page mid-drag still saves what was moved.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);

  /** Arrow keys on the thread: move one place, and say where it went. */
  const nudge = (scriptId: number, delta: number) => {
    const from = order.indexOf(scriptId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    moveTo(next); // held arrow keys are not one request per repeat either
    setAnnouncement(
      `${byId.get(scriptId)?.title ?? "Script"}, position ${to + 1} of ${next.length}`,
    );
  };

  /* One column, deliberately, and not the two-up grid a shelf of covers
     invites. Two reasons, both load-bearing: the rail is ~455px on desktop, so
     a two-up cover leaves ~130px of text measure and "A Midsummer Night's
     Dream" clamps mid-word — and a playscript's title is the one thing on this
     shelf worth reading. And Reorder measures along a single axis, so in a
     grid two covers in the same row share a y and the drag has no answer for
     which one moved. The row orientation keeps its sideways scroll. */
  const listClass = column
    ? "flex flex-col gap-2.5"
    : "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  return (
    <nav aria-label="Your scripts">
      {canArrange ? (
        <Reorder.Group
          axis={column ? "y" : "x"}
          values={order}
          onReorder={(next: number[]) => moveTo(next)}
          className={listClass}
        >
          {arranged.map((script, i) => (
            <DraggableCard
              key={script.id}
              index={i}
              script={script}
              selected={script.id === selectedId}
              column={column}
              reduceMotion={Boolean(reduceMotion)}
              position={order.indexOf(script.id) + 1}
              total={order.length}
              onNudge={(delta) => nudge(script.id, delta)}
              onSelect={() => onSelect(script.id)}
              onRequestDelete={() => onRequestDelete(script)}
              onRequestReport={() => onReport(script)}
            />
          ))}
        </Reorder.Group>
      ) : (
        <div className={listClass}>
          {arranged.map((script, i) => (
            <ScriptCard
              key={script.id}
              index={i}
              script={script}
              selected={script.id === selectedId}
              column={column}
              onSelect={() => onSelect(script.id)}
              onRequestDelete={() => onRequestDelete(script)}
              onRequestReport={() => onReport(script)}
            />
          ))}
        </div>
      )}

      {/* The house copies, below the actor's own. */}
      {pinned.length > 0 && (
        <div className={`${listClass} ${column && arranged.length > 0 ? "mt-2.5" : ""}`}>
          {pinned.map((script, i) => (
            <ScriptCard
              key={script.id}
              index={arranged.length + i}
              script={script}
              selected={script.id === selectedId}
              column={column}
              onSelect={() => onSelect(script.id)}
              onRequestDelete={() => onRequestDelete(script)}
              onRequestReport={() => onReport(script)}
            />
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </nav>
  );
}

function DraggableCard({
  script,
  index,
  selected,
  column,
  reduceMotion,
  position,
  total,
  onNudge,
  onSelect,
  onRequestDelete,
  onRequestReport,
}: {
  script: UserScript;
  index: number;
  selected: boolean;
  column: boolean;
  reduceMotion: boolean;
  position: number;
  total: number;
  onNudge: (delta: number) => void;
  onSelect: () => void;
  onRequestDelete: () => void;
  onRequestReport: () => void;
}) {
  const controls = useDragControls();
  const [held, setHeld] = useState(false);

  return (
    <Reorder.Item
      value={script.id}
      dragListener={false}
      dragControls={controls}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onDragStart={() => setHeld(true)}
      onDragEnd={() => setHeld(false)}
      className={`list-none ${column ? "min-w-0" : "w-44 shrink-0 sm:w-52"}`}
      style={{ position: "relative", zIndex: held ? 20 : undefined }}
    >
      <ScriptCard
        script={script}
        index={index}
        selected={selected}
        column={column}
        held={held}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
        onRequestReport={onRequestReport}
        thread={
          <button
            type="button"
            aria-label={`Reorder ${script.title}, position ${position} of ${total}. Use the arrow keys to move it.`}
            onPointerDown={(event) => {
              // Focus first: preventDefault below stops the browser selecting
              // text through the drag, but it also stops the button taking
              // focus, and without focus the arrow keys below never fire.
              event.currentTarget.focus();
              event.preventDefault();
              controls.start(event);
            }}
            onKeyDown={(event) => {
              const back = column ? "ArrowUp" : "ArrowLeft";
              const forward = column ? "ArrowDown" : "ArrowRight";
              if (event.key === back || event.key === forward) {
                event.preventDefault();
                onNudge(event.key === back ? -1 : 1);
              }
            }}
            className="t-script__pin"
          >
            <span aria-hidden />
            <span aria-hidden />
            <span aria-hidden />
          </button>
        }
      />
    </Reorder.Item>
  );
}

function ScriptCard({
  script,
  index = 0,
  selected,
  column,
  held = false,
  thread,
  onSelect,
  onRequestDelete,
  onRequestReport,
}: {
  script: UserScript;
  /** Position on the shelf, for the entrance only. */
  index?: number;
  selected: boolean;
  column: boolean;
  held?: boolean;
  /** The drag handle, sewn into the binding. Absent on the house copies. */
  thread?: React.ReactNode;
  onSelect: () => void;
  onRequestDelete: () => void;
  onRequestReport: () => void;
}) {
  const reduce = useReducedMotion();
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const sceneCount = script.num_scenes_extracted;
  const note = isProcessing
    ? "reading…"
    : script.is_sample
      ? "house copy"
      : sceneCount > 0
        ? `${sceneCount} ${sceneCount === 1 ? "scene" : "scenes"}`
        : "";

  return (
    <motion.div
      /* The shelf fills itself, spine by spine. Every other list in the app
         arrives on the house curve and this one — the one thing on /practice
         that is actually the actor's own work — was simply there, fully drawn,
         the instant the query resolved. Small travel and a capped stagger, so
         a shelf of twelve still finishes inside a third of a second.
         On the inner card rather than the Reorder.Item so it cannot fight the
         drag and reorder transforms on the wrapper. */
      {...entrance(index, { reduce, y: 8, duration: 0.4 })}
      className={`t-script ${held ? "is-held" : ""} ${selected ? "is-current" : ""} ${
        column ? "" : "w-44 shrink-0 sm:w-52"
      }`}
      style={{
        ["--spine" as string]: getGenreSpineColor(script.genre),
        ["--spine-ink" as string]: getGenreInkColor(script.genre),
      }}
    >
      {/* The binding: cloth, with the thread you move it by sewn into it. */}
      <span className="t-script__bind">{thread}</span>

      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="t-script__face"
      >
        <span className="t-script__title">{script.title}</span>
        <span className="t-script__foot">
          <span className="t-script__byline">
            {/* No genre on file is not a genre called "—", and no author is
                not an author called "Unknown". Either one simply is not on the
                cover, and the rule between them is drawn by CSS so a missing
                one never leaves a stranded separator. */}
            {script.genre && <span className="t-script__stamp">{script.genre}</span>}
            {script.author && script.author.toLowerCase() !== "unknown" && (
              <span className="t-script__author">{script.author}</span>
            )}
          </span>
          {note && <span className="t-script__count">{note}</span>}
        </span>
      </button>

      {/* actions — the actor's own scripts only */}
      {!script.is_sample && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Script actions" className="t-script__more">
              <IconDots className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
              onClick={onRequestReport}
            >
              <IconFlag className="h-3.5 w-3.5" />
              Flag extraction issue
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              onClick={onRequestDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete script
            </button>
          </PopoverContent>
        </Popover>
      )}
    </motion.div>
  );
}

export default PracticeLibraryRail;
