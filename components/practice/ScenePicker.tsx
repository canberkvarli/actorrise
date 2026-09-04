"use client";

import { useMemo, useState } from "react";

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
  /** Filename, used as the script's name until extraction finds a real title. */
  fileName: string;
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
 * Modern plays mark their breaks with white space, so a good share of what comes
 * back has no "Scene 2" to show. Numbering by position beats an empty row: you
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

/** Strip the extension. The filename is the only title we have at this point. */
function scriptName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Your script";
}

/**
 * Pick what to build from a script.
 *
 * This replaced a two-option dialog ("quick" or "full") that asked how hard we
 * should work rather than what the actor wanted. Nobody rehearses all of Hamlet;
 * they want the nunnery scene.
 *
 * Set on paper, in the script's own type, because that is what it is: the
 * contents page of the thing they just handed us. The rest of the app already
 * reads a script on `--paper`; a picker in generic dialog chrome would be the
 * one screen in the flow that forgot what it was looking at.
 *
 * The whole map is always shown, including scenes this plan cannot build. Hiding
 * the rest of the play to avoid mentioning a limit is how you get an actor who
 * never learns their script has twenty scenes in it.
 */
export function ScenePicker({
  scenes,
  pageCount,
  fileName,
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

  return (
    <div className="flex max-h-[min(84vh,46rem)] flex-col bg-paper text-paper-ink">
      {/* Title page. The script names itself before it lists itself. */}
      <header className="shrink-0 px-7 pb-5 pt-7 text-center sm:px-10">
        <h2 className="font-typewriter text-lg font-bold uppercase tracking-[0.2em] text-paper-ink sm:text-xl">
          {scriptName(fileName)}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-paper-muted">
          {scenes.length} {scenes.length === 1 ? "scene" : "scenes"} across {pageCount}{" "}
          {pageCount === 1 ? "page" : "pages"}. Choose what to build now — the rest
          keep, and you can come back for them.
        </p>
        <div
          aria-hidden
          className="mx-auto mt-5 h-px w-16 bg-paper-rule"
        />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 sm:px-8">
        {groups.map(([act, actScenes], groupIndex) => (
          <section key={`${act}-${groupIndex}`} className={cn(groupIndex > 0 && "mt-8")}>
            {act && (
              <div className="mb-3 flex items-center gap-3">
                <h3 className="font-typewriter text-[11px] font-bold uppercase tracking-[0.25em] text-paper-muted">
                  {act}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-paper-rule" />
              </div>
            )}
            <ul>
              {actScenes.map((scene, i) => {
                const isPicked = picked.has(scene.index);
                const blocked = !isPicked && atLimit;
                const pages = pageRange(scene);
                return (
                  <li key={scene.index}>
                    <label
                      className={cn(
                        "group relative flex cursor-pointer items-baseline gap-3 py-2.5 pl-3 pr-2 transition-colors sm:gap-4",
                        blocked && "cursor-not-allowed",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        disabled={blocked}
                        onChange={() => toggle(scene)}
                        className="peer sr-only"
                      />

                      {/* The mark in the margin, the way you would tick a
                          contents page with a pencil. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full transition-all duration-200",
                          isPicked ? "bg-primary" : "bg-transparent",
                        )}
                      />

                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 shrink-0 self-start font-typewriter text-[13px] leading-6 transition-colors",
                          isPicked
                            ? "text-primary"
                            : blocked
                              ? "text-paper-muted/35"
                              : "text-paper-muted/50 group-hover:text-paper-muted",
                        )}
                      >
                        {isPicked ? "×" : "○"}
                      </span>

                      <span
                        className={cn(
                          "min-w-0 flex-1 transition-opacity",
                          blocked && "opacity-40",
                        )}
                      >
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className={cn(
                              "font-typewriter text-[15px] leading-6 transition-colors",
                              isPicked ? "text-paper-ink" : "text-paper-ink/75",
                            )}
                          >
                            {sceneName(scene, i)}
                          </span>
                          {scene.title && (
                            <span className="text-[14px] italic leading-6 text-paper-muted">
                              {scene.title}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] leading-5 text-paper-muted/85">
                          {scene.characters.length > 0
                            ? scene.characters.slice(0, 4).join(" · ") +
                              (scene.characters.length > 4
                                ? ` · +${scene.characters.length - 4}`
                                : "")
                            : "No dialogue found"}
                        </span>
                      </span>

                      <span
                        className={cn(
                          "shrink-0 self-start text-right font-typewriter text-[11.5px] leading-5 tabular-nums text-paper-muted/70 transition-opacity",
                          blocked && "opacity-40",
                        )}
                      >
                        <span className="block">{scene.line_count} lines</span>
                        {pages && <span className="block opacity-75">{pages}</span>}
                      </span>
                    </label>
                    <span aria-hidden className="block h-px bg-paper-rule/45 last:hidden" />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-paper-rule bg-paper px-5 py-4 sm:px-8">
        {overLimit && (
          <p className="mb-3 text-[12.5px] leading-relaxed text-paper-muted">
            Your plan builds {limit} {limit === 1 ? "scene" : "scenes"} at a time.{" "}
            <button
              type="button"
              onClick={onUpgrade}
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
            >
              Build the whole play
            </button>{" "}
            — you&apos;ll come straight back here.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-typewriter text-[12.5px] tabular-nums text-paper-muted">
            {picked.size} of {scenes.length} chosen
            {limit != null && picked.size < scenes.length && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={selectAll}
                  className="underline decoration-dotted underline-offset-4 transition-colors hover:text-paper-ink"
                >
                  take {limit}
                </button>
              </>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-2 text-sm text-paper-muted transition-colors hover:bg-paper-ink/[0.06] hover:text-paper-ink"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onConfirm(scenes.filter((s) => picked.has(s.index)))}
              className={cn(
                "rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all",
                "hover:brightness-110 active:scale-[0.99]",
                "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100",
              )}
            >
              {picked.size === 0
                ? "Choose a scene"
                : `Build ${picked.size} ${picked.size === 1 ? "scene" : "scenes"}`}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ScenePicker;
