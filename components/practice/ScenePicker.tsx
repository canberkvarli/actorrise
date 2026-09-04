"use client";

import { useMemo, useState } from "react";
import { IconCheck } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One row of the map `/api/scripts/scan` returns. */
export type ScannedScene = {
  index: number;
  act_label: string | null;
  scene_label: string | null;
  title: string | null;
  characters: string[];
  line_count: number;
  char_start: number;
  char_end: number;
  page_start: number | null;
  page_end: number | null;
};

interface ScenePickerProps {
  scenes: ScannedScene[];
  pageCount: number;
  /** How many scenes this plan may build. null is unlimited. */
  limit: number | null;
  onConfirm: (picked: ScannedScene[]) => void;
  onCancel: () => void;
  onUpgrade: () => void;
}

/** "Act 1" → the run of scenes under it. Unlabelled scenes group under "". */
function byAct(scenes: ScannedScene[]): [string, ScannedScene[]][] {
  const groups: [string, ScannedScene[]][] = [];
  for (const scene of scenes) {
    const act = scene.act_label ?? "";
    const last = groups[groups.length - 1];
    if (last && last[0] === act) last[1].push(scene);
    else groups.push([act, [scene]]);
  }
  return groups;
}

/**
 * What to call a scene with no label of its own.
 *
 * Modern plays mark their breaks with white space, so a third of what comes back
 * has no "Scene 2" to show. Numbering them by position beats an empty row: you
 * cannot tick what you cannot name.
 */
function sceneName(scene: ScannedScene, positionInAct: number): string {
  return scene.scene_label ?? `Scene ${positionInAct + 1}`;
}

function pageRange(scene: ScannedScene): string | null {
  if (scene.page_start == null) return null;
  if (scene.page_end == null || scene.page_end === scene.page_start) {
    return `p. ${scene.page_start}`;
  }
  return `pp. ${scene.page_start}–${scene.page_end}`;
}

/**
 * Pick what to build from a script.
 *
 * This replaces a two-option dialog ("quick" or "full") that asked how hard to
 * work rather than what you wanted. Nobody rehearses all of Hamlet; they want
 * the nunnery scene. So the choice is the play's own contents page, and the
 * plan decides how many of them get built rather than whether the file is
 * allowed through the door.
 *
 * The whole map is always shown, including what this plan cannot build. Hiding
 * the rest of the play to avoid mentioning the limit is how you get an actor who
 * never learns their script has twenty scenes in it.
 */
export function ScenePicker({
  scenes,
  pageCount,
  limit,
  onConfirm,
  onCancel,
  onUpgrade,
}: ScenePickerProps) {
  // Default to everything the plan allows, in order. "I don't want to miss a
  // scene" is the common intent; the limit shapes it rather than the actor
  // having to tick twenty boxes to say so.
  const [picked, setPicked] = useState<Set<number>>(() => {
    const allowed = limit == null ? scenes.length : limit;
    return new Set(scenes.slice(0, allowed).map((s) => s.index));
  });

  const groups = useMemo(() => byAct(scenes), [scenes]);
  const atLimit = limit != null && picked.size >= limit;
  const overLimit = limit != null && scenes.length > limit;

  const toggle = (scene: ScannedScene) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(scene.index)) next.delete(scene.index);
      else if (limit == null || next.size < limit) next.add(scene.index);
      return next;
    });
  };

  const selectAll = () => {
    const allowed = limit == null ? scenes.length : limit;
    setPicked(new Set(scenes.slice(0, allowed).map((s) => s.index)));
  };

  const clear = () => setPicked(new Set());

  return (
    <div className="flex max-h-[min(80vh,44rem)] flex-col">
      <header className="shrink-0 border-b border-border px-6 pb-4 pt-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          What do you want to rehearse?
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {scenes.length} {scenes.length === 1 ? "scene" : "scenes"} across{" "}
          {pageCount} {pageCount === 1 ? "page" : "pages"}. Pick the ones to build
          now — the rest stay here, and you can come back for them.
        </p>
        <div className="mt-3 flex items-center gap-4 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
          >
            {limit == null ? "Select all" : `Select first ${limit}`}
          </button>
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {groups.map(([act, actScenes], groupIndex) => (
          <section key={`${act}-${groupIndex}`} className={cn(groupIndex > 0 && "mt-7")}>
            {act && (
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {act}
              </h3>
            )}
            <ul className="space-y-px">
              {actScenes.map((scene, i) => {
                const isPicked = picked.has(scene.index);
                const blocked = !isPicked && atLimit;
                const pages = pageRange(scene);
                return (
                  <li key={scene.index}>
                    <label
                      className={cn(
                        "group flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                        isPicked ? "bg-primary/[0.07]" : "hover:bg-muted/60",
                        blocked && "cursor-not-allowed opacity-45 hover:bg-transparent",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        disabled={blocked}
                        onChange={() => toggle(scene)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                          isPicked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background group-hover:border-muted-foreground",
                        )}
                      >
                        {isPicked && <IconCheck className="h-3 w-3" strokeWidth={3} />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium text-foreground">
                            {sceneName(scene, i)}
                          </span>
                          {scene.title && (
                            <span className="text-sm text-muted-foreground">
                              {scene.title}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {scene.characters.length > 0 ? (
                            <>
                              {scene.characters.slice(0, 4).join(" · ")}
                              {scene.characters.length > 4 &&
                                ` · +${scene.characters.length - 4}`}
                            </>
                          ) : (
                            "No dialogue found"
                          )}
                        </span>
                      </span>

                      <span className="shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">
                        <span className="block">{scene.line_count} lines</span>
                        {pages && <span className="block opacity-70">{pages}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-border px-6 py-4">
        {overLimit && (
          <p className="mb-3 text-xs text-muted-foreground">
            Your plan builds {limit} {limit === 1 ? "scene" : "scenes"} at a time.{" "}
            <button
              type="button"
              onClick={onUpgrade}
              className="font-medium text-primary underline decoration-dotted underline-offset-4"
            >
              Build the whole play
            </button>
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm tabular-nums text-muted-foreground">
            {picked.size} selected
            {limit != null && ` of ${limit}`}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onConfirm(scenes.filter((s) => picked.has(s.index)))}
            >
              {picked.size === 0
                ? "Pick a scene"
                : `Build ${picked.size} ${picked.size === 1 ? "scene" : "scenes"}`}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ScenePicker;
