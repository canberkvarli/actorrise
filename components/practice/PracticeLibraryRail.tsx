"use client";

import { useEffect, useRef, useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { IconDots, IconFlag, IconGripVertical, IconLoader2 } from "@tabler/icons-react";
import { Trash2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getGenreDotClassName } from "@/lib/genreColors";
import type { UserScript } from "@/hooks/useScripts";

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
 * The script shelf. Reads like a shelf of playscripts rather than a file list:
 * each card carries its genre spine down the binding edge.
 *
 * The actor arranges it. Newest-first is a filing order, and it pushed the
 * script someone is actually working toward an audition further down every
 * time they brought in anything else. Cards are dragged by the grip at the
 * binding edge rather than by the card itself, so the card stays a button, the
 * page still scrolls under a thumb, and the handle can take arrow keys for
 * anyone not using a mouse.
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

  /** Arrow keys on the grip: move one place, and say where it went. */
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

  const listClass = column
    ? "flex flex-col gap-2"
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
          {arranged.map((script) => (
            <DraggableCard
              key={script.id}
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
          {arranged.map((script) => (
            <ScriptCard
              key={script.id}
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

      {/* Samples can't be dragged, but they still line up with the cards that
          can: without the same indent their titles start a few pixels to the
          left and the shelf stops reading as one column. */}
      {pinned.length > 0 && (
        <div className={`${listClass} ${column && arranged.length > 0 ? "mt-2" : ""}`}>
          {pinned.map((script) => (
            <ScriptCard
              key={script.id}
              script={script}
              selected={script.id === selectedId}
              column={column}
              indented={canArrange}
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
      className={`list-none ${column ? "w-full" : "w-44 shrink-0 sm:w-52"}`}
      style={{ position: "relative", zIndex: held ? 20 : undefined }}
    >
      <ScriptCard
        script={script}
        selected={selected}
        column={column}
        held={held}
        onSelect={onSelect}
        onRequestDelete={onRequestDelete}
        onRequestReport={onRequestReport}
        handle={
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
            className={[
              "absolute left-1 top-1/2 z-10 inline-flex h-7 w-5 -translate-y-1/2 items-center justify-center",
              "rounded-sm text-muted-foreground/45 transition-colors",
              "hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              held ? "cursor-grabbing text-foreground" : "cursor-grab",
            ].join(" ")}
            // Without this a touch drag scrolls the page instead of moving the card.
            style={{ touchAction: "none" }}
          >
            <IconGripVertical className="h-4 w-4" />
          </button>
        }
      />
    </Reorder.Item>
  );
}

function ScriptCard({
  script,
  selected,
  column,
  held = false,
  handle,
  indented = false,
  onSelect,
  onRequestDelete,
  onRequestReport,
}: {
  script: UserScript;
  selected: boolean;
  column: boolean;
  held?: boolean;
  handle?: React.ReactNode;
  /** Leave room for a grip this card doesn't have, so it lines up with ones that do. */
  indented?: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onRequestReport: () => void;
}) {
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const sceneCount = script.num_scenes_extracted;
  // The grip sits where the text would start, so the text starts further in.
  const pad = handle || indented
    ? column
      ? "py-3.5 pl-7 pr-3"
      : "py-4 pl-8 pr-4"
    : column
      ? "py-3.5 pl-4 pr-3"
      : "py-4 pl-5 pr-4";

  return (
    <div
      className={`group/item relative ${handle ? "" : column ? "w-full" : "w-44 shrink-0 sm:w-52"}`}
    >
      {handle}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={[
          "relative flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition-all",
          pad,
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          held
            ? "border-primary/50 bg-card shadow-lg"
            : selected
              ? "border-primary/50 bg-primary/[0.06] shadow-[0_0_28px_-14px_var(--primary)]"
              : column
                ? "border-border/60 bg-card/30 hover:border-primary/30 hover:bg-card/60"
                : "border-border/60 bg-card/30 hover:-translate-y-0.5 hover:border-primary/30",
        ].join(" ")}
      >
        {/* the spine — a playscript's colored binding */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 ${getGenreDotClassName(script.genre)} ${
            selected ? "" : "opacity-70"
          }`}
        />
        <h3
          className={`font-typewriter font-semibold leading-snug text-foreground ${
            column ? "truncate text-[15px]" : "line-clamp-2 text-base"
          }`}
        >
          {script.title}
        </h3>
        <p className="mt-1 truncate font-typewriter text-[13px] text-muted-foreground">
          {script.author}
        </p>
        <div
          className={`mt-auto flex items-center justify-between gap-2 ${column ? "pt-1.5" : "pt-3"}`}
        >
          <span className="truncate font-typewriter text-[11.5px] uppercase tracking-[0.12em] text-muted-foreground/75">
            {script.genre || " "}
          </span>
          {isProcessing ? (
            <IconLoader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
          ) : script.is_sample ? (
            <span className="border border-border px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              Demo
            </span>
          ) : (
            sceneCount > 0 && (
              <span className="shrink-0 font-typewriter text-[13px] tabular-nums text-muted-foreground/80">
                {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
              </span>
            )
          )}
        </div>
      </button>

      {/* actions — user scripts only, on hover */}
      {!script.is_sample && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Script actions"
              className={[
                "absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center",
                "rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                "opacity-0 transition-opacity group-hover/item:opacity-100 focus:opacity-100 data-[state=open]:opacity-100",
              ].join(" ")}
            >
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
    </div>
  );
}

export default PracticeLibraryRail;
