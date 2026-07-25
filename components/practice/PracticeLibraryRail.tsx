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
}

/**
 * The script shelf — a horizontal row of script cards (scrolls on overflow).
 * Reads like a shelf of playscripts rather than a sparse file rail.
 */
export function PracticeLibraryRail({
  scripts,
  selectedId,
  onSelect,
  onRequestDelete,
  onReport,
}: PracticeLibraryRailProps) {
  return (
    <nav
      aria-label="Your scripts"
      className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {scripts.map((script) => (
        <ScriptCard
          key={script.id}
          script={script}
          selected={script.id === selectedId}
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
  onSelect,
  onRequestDelete,
  onRequestReport,
}: {
  script: UserScript;
  selected: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
  onRequestReport: () => void;
}) {
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const sceneCount = script.num_scenes_extracted;

  return (
    <div className="group/item relative w-44 shrink-0 sm:w-52">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={[
          "flex h-full w-full flex-col rounded-xl border p-4 text-left transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "border-primary/50 bg-primary/[0.06] shadow-[0_0_28px_-14px_var(--primary)]"
            : "border-border/60 bg-card/30 hover:-translate-y-0.5 hover:border-primary/30",
        ].join(" ")}
      >
        <div className="mb-3 flex items-center justify-between">
          {/* genre spine — sharp swatch (non-interactive indicator) */}
          <span aria-hidden className={`h-2.5 w-8 ${getGenreDotClassName(script.genre)}`} />
          {isProcessing ? (
            <IconLoader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/70" />
          ) : script.is_sample ? (
            <span className="border border-border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Demo
            </span>
          ) : (
            sceneCount > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground/60">
                {sceneCount} {sceneCount === 1 ? "scene" : "scenes"}
              </span>
            )
          )}
        </div>
        <h3
          className={`font-typewriter text-base font-semibold leading-snug line-clamp-2 ${
            selected ? "text-primary" : "text-foreground"
          }`}
        >
          {script.title}
        </h3>
        <p className="mt-0.5 truncate font-typewriter text-xs text-muted-foreground">
          {script.author}
        </p>
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
