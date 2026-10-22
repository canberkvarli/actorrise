"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconDots,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconListCheck,
} from "@tabler/icons-react";

import { PlayCover } from "@/components/monologue/PlayCover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getGenreInkColor, getGenreSpineColor } from "@/lib/genreColors";
import type { UserScript } from "@/hooks/useScripts";

interface ScriptHeaderProps {
  script: UserScript;
  canManage: boolean;
  isProcessing: boolean;
  redoing: boolean;
  /** "N of M built" when the map knows M; otherwise the scene count. */
  sceneSummary: string | null;
  /** Hidden when there is nothing left to build. */
  showBuild: boolean;
  onBuild: () => void;
  onEdit: () => void;
  onAddByHand: () => void;
  onRedo: () => void;
}

/**
 * The opened script's title page, across the top.
 *
 * It was a 260px column down the left: the cover at full size, the whole
 * synopsis, and four buttons wrapping onto two rows, with the scenes beside it
 * capped at max-w-2xl. On a script with one scene that left about 70% of the
 * page empty, and the actions were a pile rather than a choice.
 *
 * Now the cover is a thumbnail beside the title, the synopsis is three lines
 * until asked for, and there is one thing to do (Build scenes) with Edit
 * details beside it. Adding a scene by hand and Redo are rarer and the second
 * is destructive, so they sit behind the ··· where they cannot be hit by
 * accident.
 */
export function ScriptHeader({
  script,
  canManage,
  isProcessing,
  redoing,
  sceneSummary,
  showBuild,
  onBuild,
  onEdit,
  onAddByHand,
  onRedo,
}: ScriptHeaderProps) {
  const genres = script.genres?.length ? script.genres : script.genre ? [script.genre] : [];
  const author = script.author && script.author.toLowerCase() !== "unknown" ? script.author : null;
  const meta = [
    author,
    script.estimated_length_minutes ? `~${script.estimated_length_minutes} min` : null,
    sceneSummary,
  ].filter(Boolean) as string[];

  return (
    <header
      className="t-scripthead"
      style={{
        ["--spine" as string]: getGenreSpineColor(script.genre),
        ["--spine-ink" as string]: getGenreInkColor(script.genre),
      }}
    >
      {/* Same cloth and emblem as before, a third of the size. */}
      <div className="t-scripthead__cover">
        <div className="t-titlepage t-titlepage--sm">
          <PlayCover
            title={script.title}
            author={script.author}
            genre={script.genre}
            size="sm"
            className="w-full"
          />
        </div>
      </div>

      <div className="t-scripthead__title">
        {genres.length > 0 && (
          <p className="t-scripthead__stamps">
            {genres.map((g) => (
              <span key={g} className="t-scripthead__stamp">
                {g}
              </span>
            ))}
          </p>
        )}
        <h1 className="t-scripthead__name">{script.title}</h1>
        {meta.length > 0 && <p className="t-scripthead__meta">{meta.join(" · ")}</p>}
      </div>

      <div className="t-scripthead__rest">
        {script.description && <Synopsis text={script.description} />}

        {canManage && (
          <div className="t-scripthead__actions">
            {showBuild && !isProcessing && (
              <button
                type="button"
                onClick={onBuild}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <IconListCheck className="h-4 w-4" />
                Build scenes
              </button>
            )}
            <button type="button" onClick={onEdit} className="t-script-action">
              <IconPencil className="h-3.5 w-3.5" />
              Edit details
            </button>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="More for this script"
                  className="t-script-action t-script-action--icon"
                >
                  {redoing ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <IconDots className="h-4 w-4" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                <button
                  type="button"
                  onClick={onAddByHand}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Add scene by hand
                </button>
                {/* Redo was gated on having scenes once, which hid it from the
                    script that needed it most: one that came back with
                    nothing. It re-cuts from the stored text, so it is offered
                    whenever the script is not mid-read. */}
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={onRedo}
                    disabled={redoing}
                    className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    <IconRefresh className="h-3.5 w-3.5" />
                    {redoing ? "Cutting again…" : "Redo scenes"}
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * Three lines, then "more".
 *
 * The whole synopsis used to run down the column, which pushed the actions a
 * paragraph further from the title on every script with a long one. Only
 * offers "more" when the clamp actually cut something.
 */
function Synopsis({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div className="t-scripthead__synopsis">
      <p ref={ref} className={open ? "" : "line-clamp-3"}>
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="t-scripthead__more"
        >
          {open ? "less" : "more"}
        </button>
      )}
    </div>
  );
}

export default ScriptHeader;
