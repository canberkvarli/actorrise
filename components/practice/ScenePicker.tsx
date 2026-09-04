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

/**
 * How big is this scene?
 *
 * Pages, not lines. The line count comes from the dialogue parser, and on a real
 * Hamlet it read 19 for Act 2 Scene 2, which is the longest scene in the play.
 * The page span was right on the same file, because it comes from the PDF rather
 * than from parsing. Better to say one true thing than two things where you
 * cannot tell which is which.
 */
function sceneSize(scene: ScannedScene): string | null {
  if (scene.page_start == null) return null;
  const end = scene.page_end ?? scene.page_start;
  const pages = Math.max(1, end - scene.page_start + 1);
  return `${pages} ${pages === 1 ? "page" : "pages"}`;
}

function pageRange(scene: ScannedScene): string | null {
  if (scene.page_start == null) return null;
  const end = scene.page_end ?? scene.page_start;
  // Plain hyphen, not an en dash. Long dashes are out across this product.
  return end === scene.page_start ? `p. ${scene.page_start}` : `pp. ${scene.page_start}-${end}`;
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
 * contents page of the thing they just handed us.
 *
 * Nothing is chosen for you. An earlier version pre-ticked everything the plan
 * allowed, which reads as helpful and is not: it makes the first act of using
 * the screen *undoing* a choice somebody else made, and on a plan with a small
 * allowance it silently spends it on whatever happened to be first in the file.
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
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

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

  const takeAllowance = () => {
    const allowed = limit == null ? scenes.length : limit;
    setPicked(new Set(scenes.slice(0, allowed).map((s) => s.index)));
  };

  return (
    <div className="flex max-h-[min(84vh,46rem)] flex-col bg-paper text-paper-ink">
      {/* Title page. The script names itself before it lists itself. */}
      <header className="shrink-0 px-6 pb-4 pt-7 text-center sm:px-10">
        <h2 className="font-typewriter text-lg font-bold uppercase tracking-[0.2em] text-paper-ink sm:text-xl">
          {scriptName(fileName)}
        </h2>

        {/* The two numbers that describe the file, set as a line of type rather
            than as stat cards. They are one sentence long; a grid of boxes would
            be three times the furniture for the same two facts. */}
        <p className="mt-3 font-typewriter text-[15px] tracking-wide text-paper-ink/75">
          <span className="font-bold text-primary">{scenes.length}</span>{" "}
          {scenes.length === 1 ? "scene" : "scenes"}
          <span aria-hidden className="px-2 text-paper-rule">
            ·
          </span>
          <span className="font-bold text-primary">{pageCount}</span>{" "}
          {pageCount === 1 ? "page" : "pages"}
        </p>
        <p className="mx-auto mt-2.5 max-w-sm text-[14.5px] leading-relaxed text-paper-muted">
          Choose what to build now. The rest keep, and you can come back for them.
        </p>
        <div aria-hidden className="mx-auto mt-5 h-px w-16 bg-paper-rule" />
      </header>

      <div className="scrollbar-paper min-h-0 flex-1 overflow-y-auto px-3 pb-2 sm:px-7">
        {groups.map(([act, actScenes], groupIndex) => (
          <section key={`${act}-${groupIndex}`} className={cn(groupIndex > 0 && "mt-7")}>
            {/* The act heading was 11px in a 0.25em track: small type stretched
                thin, which is two things that hurt legibility at once. Bigger,
                tighter, and at full ink. */}
            {act && (
              <div className="mb-2.5 flex items-center gap-3 px-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                <h3 className="font-typewriter text-[15px] font-bold uppercase tracking-[0.14em] text-paper-ink">
                  {act}
                </h3>
                <span aria-hidden className="h-px flex-1 bg-paper-rule" />
              </div>
            )}
            <ul className="space-y-0.5">
              {actScenes.map((scene, i) => {
                const isPicked = picked.has(scene.index);
                const blocked = !isPicked && atLimit;
                const size = sceneSize(scene);
                const pages = pageRange(scene);
                return (
                  <li key={scene.index}>
                    <label
                      className={cn(
                        "group relative flex cursor-pointer items-start gap-3 rounded-md py-2.5 pl-3 pr-3 transition-colors duration-150",
                        // Chosen scenes are unmistakable: the sheet is tinted,
                        // the type darkens, and a rule runs down the margin. The
                        // old version changed one small glyph, which meant you
                        // had to hunt for what you had already picked.
                        isPicked
                          ? "bg-primary/[0.13]"
                          : blocked
                            ? "cursor-not-allowed"
                            : "hover:bg-paper-ink/[0.045]",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        disabled={blocked}
                        onChange={() => toggle(scene)}
                        className="peer sr-only"
                      />

                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-y-1 left-0 w-[3px] rounded-full transition-all duration-150",
                          isPicked ? "bg-primary" : "bg-transparent",
                        )}
                      />

                      {/* A real box, so "chosen" is legible at a glance and from
                          across the room, not a change of glyph. */}
                      <span
                        aria-hidden
                        className={cn(
                          "mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[3px] border transition-all duration-150",
                          "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper",
                          isPicked
                            ? "border-primary bg-primary"
                            : blocked
                              ? "border-paper-rule"
                              : "border-paper-ink/30 group-hover:border-paper-ink/55",
                        )}
                      >
                        {isPicked && (
                          <svg
                            viewBox="0 0 12 12"
                            className="h-[11px] w-[11px] text-primary-foreground"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 6.4 4.8 8.7 9.5 3.6" />
                          </svg>
                        )}
                      </span>

                      <span className={cn("min-w-0 flex-1", blocked && "opacity-40")}>
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className={cn(
                              "font-typewriter text-[17px] leading-7 transition-colors duration-150",
                              // Chosen rows take the brand colour outright. On a
                              // twenty-row list the eye needs a hue to run down,
                              // not a weight change it has to compare against
                              // its neighbour to notice.
                              isPicked ? "font-bold text-primary" : "text-paper-ink",
                            )}
                          >
                            {sceneName(scene, i)}
                          </span>
                          {scene.title && (
                            <span className="text-[15.5px] italic leading-7 text-paper-ink/70">
                              {scene.title}
                            </span>
                          )}
                        </span>
                        {/* Cast was 12.5px at 85% ink, which on a warm sheet is
                            under the contrast floor and reads as grey noise.
                            Full muted ink, a size up. */}
                        <span className="mt-1 block truncate text-[14px] leading-5 text-paper-muted">
                          {scene.characters.length > 0
                            ? scene.characters.slice(0, 4).join(" · ") +
                              (scene.characters.length > 4
                                ? ` · +${scene.characters.length - 4}`
                                : "")
                            : "No dialogue found"}
                        </span>
                      </span>

                      {/* These were 11.5px at 65% ink: the smallest and faintest
                          type on the sheet, carrying the one number that tells
                          you how big a scene is. Now the size of the cast line,
                          at full ink, with the page span a step back rather than
                          a whisper. */}
                      <span
                        className={cn(
                          "shrink-0 self-start pt-1 text-right font-typewriter text-[14px] leading-[1.5] tabular-nums transition-colors duration-150",
                          isPicked ? "text-paper-ink" : "text-paper-muted",
                          blocked && "opacity-40",
                        )}
                      >
                        {size && <span className="block font-bold">{size}</span>}
                        {pages && (
                          <span className="block text-[12.5px] text-paper-muted/80">
                            {pages}
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <footer className="shrink-0 border-t border-paper-rule bg-paper px-5 py-4 sm:px-8">
        {overLimit && (
          <p className="mb-3 text-[14px] leading-relaxed text-paper-muted">
            Your plan builds {limit} {limit === 1 ? "scene" : "scenes"} at a time.{" "}
            <button
              type="button"
              onClick={onUpgrade}
              className="font-medium text-primary underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
            >
              Build the whole play
            </button>
            , and you come straight back here.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-typewriter text-[12.5px] tabular-nums text-paper-muted">
            {picked.size === 0 ? (
              <>Nothing chosen yet</>
            ) : (
              <>
                <span className="font-bold text-primary">{picked.size}</span> of{" "}
                {scenes.length} chosen
              </>
            )}
            {limit != null && picked.size < Math.min(limit, scenes.length) && (
              <>
                <span aria-hidden className="px-2 text-paper-rule">
                  ·
                </span>
                <button
                  type="button"
                  onClick={takeAllowance}
                  className="underline decoration-dotted underline-offset-4 transition-colors hover:text-paper-ink"
                >
                  take {Math.min(limit, scenes.length)}
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
