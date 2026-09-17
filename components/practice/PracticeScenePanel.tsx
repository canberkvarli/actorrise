"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  IconChevronDown,
  IconArrowRight,
  IconLoader2,
  IconPlus,
  IconPencil,
  IconRefresh,
  IconScissorsOff,
} from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGenreBorderClassName } from "@/lib/genreColors";
import { entrance } from "@/lib/motion";
import { PlayCover } from "@/components/monologue/PlayCover";
import { invalidateShelf, useScript, type UserScript } from "@/hooks/useScripts";
import { groupScenesByAct, formatSceneDuration, type Scene } from "@/lib/scenes";
import { EditScriptDetailsModal } from "@/components/practice/EditScriptDetailsModal";
import { AddSceneToScriptModal } from "@/components/scenepartner/AddSceneToScriptModal";

type ScriptWithScenes = UserScript & { scenes: Scene[] };

interface PracticeScenePanelProps {
  /** The selected script from the list (used for an instant header). */
  script: UserScript;
}

/**
 * Right pane of the /practice library — the single script surface. Shows the
 * selected script's scenes grouped by act; tap a scene to preview its synopsis
 * and open it in the editor. Header carries the script's management actions
 * (Add scene, Edit details) that used to live on the old /practice/[id] page.
 */
export function PracticeScenePanel({ script }: PracticeScenePanelProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const { data, isLoading } = useScript(script.id) as {
    data: ScriptWithScenes | undefined;
    isLoading: boolean;
  };

  const [expandedSceneId, setExpandedSceneId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [redoing, setRedoing] = useState(false);
  /* The scene being opened. Holds for one beat so the room can take its light
     off everything else first — see `openScene`. */
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const [cost, setCost] = useState<{ scenes: number; sessions: number } | null>(null);

  const scenes = data?.scenes ?? [];
  const groups = groupScenesByAct(scenes);
  const existingActs = [...new Set(scenes.map((s) => s.act).filter((a): a is string => !!a))];
  const canManage = !script.is_sample;
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  const refreshScenes = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts", script.id] });
    // A re-cut purges the old scenes, so the stage must stop pointing at them.
    return invalidateShelf(queryClient);
  };

  /**
   * Ask before re-cutting, but only when there is something to lose.
   *
   * A re-cut replaces the scenes and clears the rehearsal history recorded on
   * them, which is a fair trade to offer and an unforgivable one to make
   * silently. So the dialog fetches the real numbers and says them.
   *
   * On a script with no scenes there is nothing at stake, and a confirmation
   * would be pure friction on the one screen that exists to get the actor
   * unstuck. That case goes straight through.
   */
  const requestRedo = async () => {
    if (scenes.length === 0) {
      await redoScenes();
      return;
    }
    setCost(null);
    setConfirmRedo(true);
    try {
      const res = await api.get<{ scenes: number; sessions: number }>(
        `/api/scripts/${script.id}/recut-cost`,
      );
      setCost(res.data);
    } catch {
      // Fall back to the general warning rather than blocking the retry.
      setCost({ scenes: scenes.length, sessions: -1 });
    }
  };

  /**
   * Scene division is the part of extraction that varies run to run, so an
   * actor who gets a bad split can ask for another pass instead of writing in.
   * It re-cuts from the stored text; a file misread at the page level needs
   * uploading again.
   */
  const redoScenes = async () => {
    setRedoing(true);
    try {
      await api.post(`/api/scripts/${script.id}/reextract`, undefined, {
        timeoutMs: 5 * 60 * 1000,
      });
      setExpandedSceneId(null);
      await refreshScenes();
      toast.success("Fresh cut of the scenes");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "That pass didn't work. Your scenes are untouched.",
      );
    } finally {
      setRedoing(false);
    }
  };

  const metaParts: string[] = [];
  if (script.author) metaParts.push(script.author);
  if (script.estimated_length_minutes) metaParts.push(`~${script.estimated_length_minutes} min`);
  if (script.num_scenes_extracted > 0)
    metaParts.push(`${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`);

  /* The preview, not the editor.
     Tapping a scene used to land on four thousand lines of line-editing, which
     is what made that screen read as a confusing "preview". The preview is its
     own page now; "edit the scene" is a link on it. */
  const sceneHref = (sceneId: number) => `/practice/${script.id}/scenes/${sceneId}`;

  /**
   * Into the scene.
   *
   * A plain router.push cut from a list of rows to a full page of sides with
   * nothing in between, which is the jump this pass was asked to fix. So the
   * room answers first: the chosen row takes the light, everything around it
   * goes down, and the navigation happens on the far side of that beat. The
   * preview then opens on its own staggered entrance, so the two read as one
   * move rather than a cut.
   *
   * 190ms — long enough to see the light change, short enough that nobody
   * waiting to rehearse would call it a delay. Reduced motion goes straight
   * there.
   */
  const openScene = (sceneId: number) => {
    if (openingId) return;
    if (reduce) {
      router.push(sceneHref(sceneId));
      return;
    }
    setOpeningId(sceneId);
    window.setTimeout(() => router.push(sceneHref(sceneId)), 190);
  };

  return (
    // The selected script, opened like a playbook: title page on the left,
    // the scenes on the right. Same spine color as its card on the shelf,
    // so the eye connects the two.
    // overflow-clip, not overflow-hidden: hidden makes this a scroll container
    // and the sticky title page below stops sticking. Clipping is identical.
    // The opened script is not a card on the page any more; it is the page.
    // The room gives it the full width once it is open, so the scene titles
    // have somewhere to go.
    <div className="min-w-0 md:grid md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:gap-10">
      {/* Title page: a bound playscript, cloth and emblem, on a hard gel
          shadow. It is the same cover the search detail panel prints, so a
          play looks like itself wherever you meet it. */}
      <div className="min-w-0">
        <div className="flex min-w-0 flex-col gap-3 md:sticky md:top-6">
          <div className="t-titlepage">
            <PlayCover
              title={script.title}
              author={script.author}
              genre={script.genre}
              className="w-full"
            />
          </div>
          {metaParts.length > 0 && (
            <p
              className="mt-5 text-sm"
              style={{ color: "var(--t-muted-light)" }}
            >
              {metaParts.join(" · ")}
            </p>
          )}
          {script.description && (
            <p
              className="max-w-[32ch] text-[15px] leading-relaxed"
              style={{ color: "var(--t-muted-light-3)" }}
            >
              {script.description}
            </p>
          )}
  
          {/* These sat on mt-auto, which pinned them to the bottom of a column
              that stretches to match the scene list. Every scene extracted pushed
              them further down, so on a full play they were a screen and a half
              below the script they act on. They belong under the synopsis. */}
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="t-script-action"
              >
                <IconPencil className="h-3.5 w-3.5" />
                Edit details
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="t-script-action"
              >
                <IconPlus className="h-3.5 w-3.5" />
                Add scene
              </button>
              {/* This used to be gated on `scenes.length > 0`, which hid it in the
                  one case that needs it most: a script that came back with nothing.
                  An actor looking at an empty shelf item had no way to ask for
                  another pass and no reason to think one was possible, so the only
                  move left was deleting and re-uploading, which costs an upload.
                  Re-cutting works off the stored text, so offer it whenever there
                  is text to cut. */}
              {!isProcessing && (
                <button
                  type="button"
                  onClick={requestRedo}
                  disabled={redoing}
                  className="t-script-action t-script-action--quiet"
                >
                  {redoing ? (
                    <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <IconRefresh className="h-3.5 w-3.5" />
                  )}
                  {redoing ? "Cutting again…" : "Redo scenes"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The scenes */}
      <div className="mt-8 min-w-0 md:mt-0">
        {isProcessing ? (
          <ScenesComingIn />
        ) : isLoading && scenes.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          /* A finished script with no scenes reads as a dead end, so it is the
             one empty state that has to carry its own way out. Both roads are
             here: another pass at the text, or writing the scene by hand. */
          <NothingCameBack
            failed={isFailed}
            reason={script.processing_error}
            canManage={canManage}
            redoing={redoing}
            onRedo={redoScenes}
            onAdd={() => setAddOpen(true)}
          />
        ) : (
          <div className="space-y-8">
            {groups.map((group, gi) => (
              <div key={group.act ?? `g${gi}`} className="space-y-3">
                {group.act && (
                  <div
                    className="flex items-baseline justify-between gap-3 pb-2.5"
                    style={{ borderBottom: "1.5px solid var(--t-line-dark-2)" }}
                  >
                    <h3 className="t-act-name">{group.act}</h3>
                    <span className="t-act-count tabular-nums">
                      ({group.scenes.length} {group.scenes.length === 1 ? "scene" : "scenes"}.)
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {group.scenes.map((scene, si) => (
                    <SceneRow
                      key={scene.id}
                      /* Counted across the whole panel, not per act: two acts
                         each restarting their own stagger reads as two lists
                         that happen to be stacked. */
                      index={groups.slice(0, gi).reduce((n, g) => n + g.scenes.length, 0) + si}
                      scene={scene}
                      accentClass={getGenreBorderClassName(script.genre ?? "")}
                      expanded={expandedSceneId === scene.id}
                      onToggle={() => {
                        setExpandedSceneId((cur) => (cur === scene.id ? null : scene.id));
                        router.prefetch(sceneHref(scene.id));
                      }}
                      onOpen={() => openScene(scene.id)}
                      opening={openingId === scene.id}
                      dimmed={openingId !== null && openingId !== scene.id}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <>
          <EditScriptDetailsModal open={editOpen} onOpenChange={setEditOpen} script={script} />
          <AddSceneToScriptModal
            open={addOpen}
            onOpenChange={setAddOpen}
            scriptId={script.id}
            existingActs={existingActs}
            onSceneAdded={refreshScenes}
          />
          <ConfirmRecutDialog
            open={confirmRedo}
            onOpenChange={setConfirmRedo}
            cost={cost}
            redoing={redoing}
            onConfirm={async () => {
              setConfirmRedo(false);
              await redoScenes();
            }}
          />
        </>
      )}
    </div>
  );
}

function SceneRow({
  scene,
  index = 0,
  accentClass,
  expanded,
  onToggle,
  onOpen,
  opening = false,
  dimmed = false,
}: {
  scene: Scene;
  /** Position in the panel, for the entrance only. */
  index?: number;
  /** Genre-tinted left edge (border-l-* class from genreColors). */
  accentClass: string;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** This is the one being opened: it takes the light. */
  opening?: boolean;
  /** Another one is being opened: stand down. */
  dimmed?: boolean;
}) {
  const reduce = useReducedMotion();
  const ent = entrance(index, { reduce, y: 6, duration: 0.36 });
  const characters = [scene.character_1_name, scene.character_2_name].filter(Boolean);
  const duration = formatSceneDuration(scene.estimated_duration_seconds);

  const subParts: string[] = [];
  if (characters.length > 0) subParts.push(characters.join(" & "));
  if (duration) subParts.push(duration);
  if (scene.line_count > 0) subParts.push(`${scene.line_count} lines`);

  // scene_number is free text ("Scene 2", "2A") — the ghost numeral wants the
  // digits alone, and nothing at all when there aren't any.
  const numeral = String(scene.scene_number ?? "").match(/\d+/)?.[0] ?? null;

  return (
    <motion.div
      /* The scenes come in the way everything else does (lib/motion). Opening
         a script used to swap the stage for a finished block of rows, which is
         the one moment on this screen where something new is being handed over
         and the only one that did not look like it. */
      /* Spread would not do here: `transition={undefined}` in the normal case
         overrides the entrance's own delay and kills the stagger. The two are
         merged by hand instead. */
      initial={ent.initial}
      /* The beat before the page turns. The chosen row comes up and forward,
         everything else goes down, and the navigation lands on the far side of
         it — see openScene in the panel. */
      animate={
        opening
          ? { opacity: 1, y: 0, scale: 1.015 }
          : dimmed
            ? { opacity: 0.35, y: 0, scale: 1 }
            : ent.animate
      }
      transition={
        opening || dimmed ? { duration: 0.19, ease: [0.22, 1, 0.36, 1] } : ent.transition
      }
      style={
        opening
          ? { boxShadow: "0 0 0 1.5px var(--t-gel-ink), 0 14px 34px -14px rgb(0 0 0 / 0.4)" }
          : undefined
      }
      className={[
        "rounded-lg border border-l-2 transition-colors",
        accentClass,
        expanded ? "border-primary/45 bg-muted/20" : "border-border/70 hover:border-border hover:bg-muted/10",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {numeral && (
          <span
            aria-hidden
            className="w-6 shrink-0 select-none text-center font-brand text-xl leading-none text-foreground/15 tabular-nums"
          >
            {numeral}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-typewriter font-semibold text-sm text-foreground truncate">
            {scene.title}
          </p>
          {subParts.length > 0 && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subParts.join(" · ")}</p>
          )}
        </div>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {scene.description?.trim() || "No synopsis for this scene yet."}
              </p>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                {characters.length > 0 && (
                  <div>
                    <dt className="inline text-muted-foreground/60">Characters: </dt>
                    <dd className="inline text-foreground">{characters.join(", ")}</dd>
                  </div>
                )}
                {duration && (
                  <div>
                    <dt className="inline text-muted-foreground/60">Length: </dt>
                    <dd className="inline text-foreground">{duration}</dd>
                  </div>
                )}
                {scene.line_count > 0 && (
                  <div>
                    <dt className="inline text-muted-foreground/60">Lines: </dt>
                    <dd className="inline text-foreground">{scene.line_count}</dd>
                  </div>
                )}
                {scene.act && (
                  <div>
                    <dt className="inline text-muted-foreground/60">Act: </dt>
                    <dd className="inline text-foreground">{scene.act}</dd>
                  </div>
                )}
              </dl>
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 rounded-md px-4 h-10 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open in editor
                <IconArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Naming the price before it is paid.
 *
 * Redo used to fire the moment it was tapped, and what it does is not obvious
 * from the label: it spends minutes re-reading the script, replaces every
 * scene, and clears the rehearsal history recorded against them. That last part
 * is the one worth stopping for, so the dialog counts the sessions at stake and
 * says the number rather than warning in the abstract.
 */
function ConfirmRecutDialog({
  open,
  onOpenChange,
  cost,
  redoing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cost: { scenes: number; sessions: number } | null;
  redoing: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const sessions = cost?.sessions ?? 0;
  const sceneCount = cost?.scenes ?? 0;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-brand text-xl font-medium tracking-tight">
            Cut this script again?
          </DialogTitle>
          <DialogDescription className="pt-1 leading-relaxed">
            {cost === null
              ? "Checking what this would replace…"
              : sessions > 0
                ? `This reads the script again and replaces ${plural(sceneCount, "scene")}. The ${plural(sessions, "rehearsal session")} recorded on them go too, and that history can't be brought back.`
                : sessions < 0
                  ? `This reads the script again and replaces ${plural(sceneCount, "scene")}, along with any rehearsal history on them.`
                  : `This reads the script again and replaces ${plural(sceneCount, "scene")}. Nothing has been rehearsed on them yet, so there is no history to lose.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Keep what I have
          </Button>
          <Button
            type="button"
            variant={sessions > 0 ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={redoing || cost === null}
            className="gap-2"
          >
            <IconRefresh className="h-4 w-4" />
            Cut again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The empty script. Not a shrug, an offer.
 *
 * What was here said "No scenes yet. Use Add scene to create one." next to a
 * play the actor had just watched the app read for two minutes, which reads as
 * "your upload vanished". The honest version says the pass came back empty,
 * says the script is still saved, and puts the retry under the sentence that
 * explains it rather than leaving it in a header the actor has stopped reading.
 */
function NothingCameBack({
  failed,
  reason,
  canManage,
  redoing,
  onRedo,
  onAdd,
}: {
  failed: boolean;
  reason?: string | null;
  canManage: boolean;
  redoing: boolean;
  onRedo: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center border border-dashed border-border/60 px-6 py-12 text-center">
      <IconScissorsOff
        aria-hidden
        className="h-7 w-7 text-muted-foreground/40"
        stroke={1.5}
      />
      <h3 className="mt-4 font-brand text-xl font-medium tracking-tight text-foreground text-balance">
        {failed ? "That pass came back empty" : "No scenes on this one yet"}
      </h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground text-balance">
        {reason ||
          (failed
            ? "I couldn't find dialogue to cut into scenes."
            : "Nothing has been cut from this script yet.")}
      </p>

      {canManage && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRedo}
            disabled={redoing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 h-9 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {redoing ? (
              <IconLoader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconRefresh className="h-4 w-4" />
            )}
            {redoing ? "Cutting again…" : "Cut the scenes again"}
          </button>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-3.5 h-9 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
          >
            <IconPlus className="h-4 w-4" />
            Write one myself
          </button>
        </div>
      )}

      {canManage && (
        <p className="mt-4 text-xs text-muted-foreground/70">
          Your script is saved. Cutting it again is free and doesn&apos;t use an upload.
        </p>
      )}
    </div>
  );
}

/**
 * The scenes, arriving.
 *
 * This was a dashed box with a spinner and "Still pulling scenes out of this
 * script. Hang tight." — one static sentence for a wait that is the entire
 * reason the actor uploaded anything, and the moment the product is doing its
 * most impressive work. Nothing on screen suggested anything was being built.
 *
 * So the panel shows the scenes being cut: ghost rows that draw themselves in,
 * in order, one after another, and start again — the shape of the list that is
 * about to exist, filling in. Same row geometry as a real scene row, so when
 * the actual scenes land they arrive into the shape their placeholders were
 * holding rather than replacing a spinner with a list.
 */
function ScenesComingIn() {
  const reduce = useReducedMotion();
  const ghosts = [0, 1, 2, 3, 4];

  return (
    <div>
      <p
        className="m-0 flex items-center gap-2.5 text-[12px] italic tracking-[0.06em]"
        style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
      >
        {!reduce && (
          <motion.span
            aria-hidden
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{ background: "var(--t-gel-ink)" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        (cutting it into scenes.)
      </p>

      <div className="mt-4 space-y-1.5" aria-hidden>
        {ghosts.map((i) => (
          <motion.div
            key={i}
            className="relative overflow-hidden rounded-lg border border-l-2"
            style={{ borderColor: "var(--t-line-light)", height: 52 }}
            initial={reduce ? false : { opacity: 0.25 }}
            animate={
              reduce
                ? { opacity: 0.4 }
                : {
                    opacity: [0.25, 0.75, 0.25],
                    borderLeftColor: [
                      "var(--t-line-light)",
                      "var(--t-gel-ink)",
                      "var(--t-line-light)",
                    ],
                  }
            }
            transition={
              reduce
                ? { duration: 0 }
                : {
                    duration: 2.6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.34,
                  }
            }
          >
            {/* The row filling in: a numeral, a title, a line of facts. */}
            <div className="flex h-full items-center gap-3 px-4">
              <span
                className="text-[13px] tabular-nums"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <motion.span
                  className="block h-[9px] rounded-full"
                  style={{ background: "var(--t-line-light)" }}
                  initial={reduce ? false : { width: "18%" }}
                  animate={reduce ? { width: "58%" } : { width: ["18%", "58%", "18%"] }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.34 }
                  }
                />
                <motion.span
                  className="block h-[6px] rounded-full"
                  style={{ background: "var(--t-line-light)", opacity: 0.6 }}
                  initial={reduce ? false : { width: "10%" }}
                  animate={reduce ? { width: "34%" } : { width: ["10%", "34%", "10%"] }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          duration: 2.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.34 + 0.12,
                        }
                  }
                />
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <p
        className="m-0 mt-4 text-[13px]"
        style={{ color: "var(--t-muted-dark)" }}
      >
        This can take a few minutes on a full play. You can leave this page —
        it keeps going without you.
      </p>
    </div>
  );
}

export default PracticeScenePanel;
