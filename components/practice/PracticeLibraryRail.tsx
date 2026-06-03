"use client";

import { IconDots, IconLoader2 } from "@tabler/icons-react";
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
}

/**
 * The library picker. Vertical rail on desktop (left column), horizontal chip
 * scroller on mobile. Genre is shown as a small sharp swatch (non-interactive
 * indicators stay square per the UI conventions).
 */
export function PracticeLibraryRail({
  scripts,
  selectedId,
  onSelect,
  onRequestDelete,
}: PracticeLibraryRailProps) {
  return (
    <nav
      aria-label="Your scripts"
      className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
    >
      {scripts.map((script) => (
        <RailItem
          key={script.id}
          script={script}
          selected={script.id === selectedId}
          onSelect={() => onSelect(script.id)}
          onRequestDelete={() => onRequestDelete(script)}
        />
      ))}
    </nav>
  );
}

function RailItem({
  script,
  selected,
  onSelect,
  onRequestDelete,
}: {
  script: UserScript;
  selected: boolean;
  onSelect: () => void;
  onRequestDelete: () => void;
}) {
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const sceneCount = script.num_scenes_extracted;

  return (
    <div className="group/item relative shrink-0 lg:w-full">
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={[
          "w-full text-left flex items-center gap-2.5 rounded-lg px-3 py-2",
          "border lg:border-0 lg:rounded-md transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected
            ? "bg-muted text-foreground border-border lg:pl-4"
            : "text-muted-foreground border-border/60 hover:bg-muted/50 hover:text-foreground",
        ].join(" ")}
      >
        {/* Selected accent — sharp brand bar, desktop only */}
        {selected && (
          <span
            aria-hidden
            className="hidden lg:block absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[#CB4B00]"
          />
        )}
        <span
          aria-hidden
          className={`h-2.5 w-2.5 shrink-0 ${getGenreDotClassName(script.genre)}`}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{script.title}</span>

        {isProcessing ? (
          <IconLoader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/70" />
        ) : script.is_sample ? (
          <span className="shrink-0 border border-border px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground font-medium">
            Demo
          </span>
        ) : (
          sceneCount > 0 && (
            <span className="hidden lg:inline shrink-0 text-xs tabular-nums text-muted-foreground/60 pr-4">
              {sceneCount}
            </span>
          )
        )}
      </button>

      {/* Delete — desktop only, user scripts only, on hover/selection */}
      {!script.is_sample && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Script actions"
              className={[
                "hidden lg:inline-flex absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 items-center justify-center",
                "rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted",
                "opacity-0 group-hover/item:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 transition-opacity",
              ].join(" ")}
            >
              <IconDots className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors rounded-sm"
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
