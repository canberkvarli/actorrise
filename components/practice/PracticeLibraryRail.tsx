"use client";

import { IconDots, IconFlag, IconLoader2 } from "@tabler/icons-react";
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
}

/**
 * The script shelf. Reads like a shelf of playscripts rather than a file list:
 * each card carries its genre spine down the binding edge.
 */
export function PracticeLibraryRail({
  scripts,
  selectedId,
  onSelect,
  onRequestDelete,
  onReport,
  orientation = "row",
}: PracticeLibraryRailProps) {
  const column = orientation === "column";
  return (
    <nav
      aria-label="Your scripts"
      className={
        column
          ? "flex flex-col gap-2"
          : "flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
    >
      {scripts.map((script) => (
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
    </nav>
  );
}

function ScriptCard({
  script,
  selected,
  column,
  onSelect,
  onRequestDelete,
  onRequestReport,
}: {
  script: UserScript;
  selected: boolean;
  column: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onRequestReport: () => void;
}) {
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const sceneCount = script.num_scenes_extracted;

  return (
    <div className={`group/item relative ${column ? "w-full" : "w-44 shrink-0 sm:w-52"}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={[
          "relative flex h-full w-full flex-col overflow-hidden rounded-lg border text-left transition-all",
          column ? "py-3 pl-4 pr-3" : "py-4 pl-5 pr-4",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected
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
            column ? "truncate text-sm" : "line-clamp-2 text-base"
          }`}
        >
          {script.title}
        </h3>
        <p className="mt-0.5 truncate font-typewriter text-xs text-muted-foreground">
          {script.author}
        </p>
        <div
          className={`mt-auto flex items-center justify-between gap-2 ${column ? "pt-1.5" : "pt-3"}`}
        >
          <span className="truncate text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
            {script.genre || " "}
          </span>
          {isProcessing ? (
            <IconLoader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
          ) : script.is_sample ? (
            <span className="border border-border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Demo
            </span>
          ) : (
            sceneCount > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
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
