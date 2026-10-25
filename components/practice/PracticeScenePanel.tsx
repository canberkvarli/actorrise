"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { IconLoader2, IconPlus, IconRefresh, IconScissorsOff } from "@tabler/icons-react";
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
import { getGenreBorderClassName, getGenreInkColor, getGenreSpineColor } from "@/lib/genreColors";
import { invalidateShelf, useScript, type UserScript } from "@/hooks/useScripts";
import { invalidateSceneMap, useSceneMap } from "@/hooks/useSceneMap";
import { formatSceneDuration, type Scene } from "@/lib/scenes";
import { mergeSceneMap, tickableRows } from "@/lib/scriptMap";
import { EditScriptDetailsModal } from "@/components/practice/EditScriptDetailsModal";
import { AddSceneToScriptModal } from "@/components/scenepartner/AddSceneToScriptModal";
import { useUpload } from "@/components/practice/UploadProvider";
import { ScriptHeader } from "@/components/practice/ScriptHeader";
import { FIRST_OPEN_ROW_ID, ScriptMap } from "@/components/practice/ScriptMap";
import { ShareAsk, ShareRowAction } from "@/components/practice/ShareScene";
import { useShareable } from "@/hooks/useShelf";

type ScriptWithScenes = UserScript & { scenes: Scene[] };

interface PracticeScenePanelProps {
  /** The selected script from the list (used for an instant header). */
  script: UserScript;
}

/**
 * The opened script on /practice: its title page across the top, and the
 * whole script below it in script order (see ScriptMap), built scenes to open
 * and the rest to tick and build. This file holds the states around those two
 * (reading, empty, one scene) and the dialogs they share.
 */
export function PracticeScenePanel({ script }: PracticeScenePanelProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const queryClient = useQueryClient();
  const { data, isLoading } = useScript(script.id) as {
    data: ScriptWithScenes | undefined;
    isLoading: boolean;
  };

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [redoing, setRedoing] = useState(false);
  /* The scene being opened. Holds for one beat so the room can take its light
     off everything else first — see `openScene`. */
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [confirmRedo, setConfirmRedo] = useState(false);
  const [cost, setCost] = useState<{ scenes: number; sessions: number } | null>(null);

  const scenes = useMemo(() => data?.scenes ?? [], [data]);
  const existingActs = [...new Set(scenes.map((s) => s.act).filter((a): a is string => !!a))];
  const canManage = !script.is_sample;
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";
  const { chooseMore, buildScenes, showWholeScript, openUpgrade } = useUpload();
  const shelved = {
    id: script.id,
    title: script.title,
    original_filename: script.original_filename,
  };

  /* The whole script. Samples belong to nobody, so the endpoint (owner only)
     is not asked about them. */
  const sceneMap = useSceneMap(script.id, canManage);
  const map = sceneMap.data;
  const ready = map && !map.needs_file ? map : null;
  const groups = useMemo(
    () =>
      ready
        ? mergeSceneMap(ready.scan.scenes ?? [], ready.built, scenes)
        : mergeSceneMap([], [], scenes),
    [ready, scenes],
  );
  const tickable = tickableRows(groups).length;

  /* Where each built scene stands on the scene library: shared, or what the
     actor answered when asked. Samples and shelf copies are nobody's to share. */
  const canShare = canManage && !script.original_filename?.startsWith("shelf-");
  const shareable = useShareable(canShare && scenes.length > 0, script.id);
  const shareById = useMemo(
    () => new Map((shareable.data?.items ?? []).map((s) => [s.scene_id, s])),
    [shareable.data],
  );
  const shareFor = canShare ? (sceneId: number) => <ShareRowAction item={shareById.get(sceneId)} /> : undefined;
  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);

  // A read finishing is the moment built rows change, so the map is asked again.
  const wasProcessing = useRef(isProcessing);
  useEffect(() => {
    if (wasProcessing.current && !isProcessing) void invalidateSceneMap(queryClient, script.id);
    wasProcessing.current = isProcessing;
  }, [isProcessing, queryClient, script.id]);

  const refreshScenes = () => {
    queryClient.invalidateQueries({ queryKey: ["scripts", script.id] });
    void invalidateSceneMap(queryClient, script.id);
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

  /**
   * The one thing to do up top. Where the map is on the page, it goes to the
   * first scene there is to tick. An older upload asks for its file, once. If
   * the map could not be read, the picker is still there as before.
   */
  const startBuilding = () => {
    if (map?.needs_file) {
      showWholeScript(shelved);
      return;
    }
    const first = document.getElementById(FIRST_OPEN_ROW_ID);
    if (ready && first) {
      first.closest("label")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      first.focus({ preventScroll: true });
      return;
    }
    chooseMore(shelved);
  };

  /* The preview, not the editor.
     Tapping a scene used to land on four thousand lines of line-editing, which
     is what made that screen read as a confusing "preview". The preview is its
     own page now; "edit the scene" is a link on it. */
  const sceneHref = (sceneId: number) => `/practice/${script.id}/scenes/${sceneId}`;

  /**
   * Into the scene.
   *
   * A plain router.push cut from a list of rows to a full page of sides with
   * nothing in between. So the room answers first: the chosen row takes the
   * light, everything around it goes down, and the navigation happens on the
   * far side of that beat. 190ms: long enough to see the light change, short
   * enough that nobody waiting to rehearse would call it a delay. Reduced
   * motion goes straight there.
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

  const builtCount = ready ? Math.max(ready.built_count, scenes.length) : scenes.length;
  const sceneSummary = ready && totalRows > 0
    ? `${totalRows} ${totalRows === 1 ? "scene" : "scenes"} · ${builtCount} built`
    : scenes.length > 0
      ? `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}`
      : null;

  const accentClass = getGenreBorderClassName(script.genre ?? "");
  // The whole script is the one built scene: the scene IS the page.
  const isSolo = scenes.length === 1 && tickable === 0 && totalRows === 1 && !map?.needs_file;
  const nothing = scenes.length === 0 && tickable === 0;

  return (
    <div
      className="t-opened min-w-0"
      /* The shelf's binding colour, carried onto the built scenes' edge so a
         script looks like itself on the shelf and open. */
      style={{
        ["--spine" as string]: getGenreSpineColor(script.genre),
        ["--spine-ink" as string]: getGenreInkColor(script.genre),
      }}
    >
      <ScriptHeader
        script={script}
        canManage={canManage}
        isProcessing={isProcessing}
        redoing={redoing}
        sceneSummary={sceneSummary}
        showBuild={!!map?.needs_file || sceneMap.isError || tickable > 0}
        onBuild={startBuilding}
        onEdit={() => setEditOpen(true)}
        onAddByHand={() => setAddOpen(true)}
        onRedo={requestRedo}
      />

      <div className="mt-8 min-w-0 sm:mt-10">
        {!isProcessing && !isFailed && script.processing_error && scenes.length > 0 && (
          <p className="mb-4 text-sm" style={{ color: "var(--t-muted-light)" }}>
            {script.processing_error}
          </p>
        )}
        {canShare && !isProcessing && scenes.length > 0 && <ShareAsk scriptId={script.id} />}
        {isProcessing && scenes.length === 0 ? (
          <ScenesComingIn />
        ) : isLoading && scenes.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : nothing && !(canManage && sceneMap.isLoading) ? (
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
        ) : isSolo && scenes[0] ? (
          <SoloScene
            scene={scenes[0]}
            accentClass={accentClass}
            onOpen={() => openScene(scenes[0].id)}
            opening={openingId === scenes[0].id}
            share={shareFor?.(scenes[0].id)}
          />
        ) : (
          <ScriptMap
            groups={groups}
            scenes={scenes}
            map={map}
            mapLoading={sceneMap.isLoading}
            canManage={canManage}
            isProcessing={isProcessing}
            openingId={openingId}
            onOpen={openScene}
            onPrefetch={(id) => router.prefetch(sceneHref(id))}
            onShowWholeScript={() => showWholeScript(shelved)}
            onBuild={(picks) => buildScenes(shelved, picks)}
            onUpgrade={openUpgrade}
            shareFor={shareFor}
          />
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

/**
 * The whole script, when the whole script is one scene.
 *
 * 11 of 20 scripts in the library hold exactly one. The list gave that case a
 * numeral (labelling a list of one), a disclosure chevron marooned at the far
 * right of a 1,420px row, and a synopsis folded away behind it — three controls
 * for a choice the actor does not have. Here the scene IS the page: what it is,
 * who is in it, how long, what happens, and one way in.
 */
function SoloScene({
  scene,
  accentClass,
  onOpen,
  opening = false,
  share,
}: {
  scene: Scene;
  accentClass: string;
  onOpen: () => void;
  opening?: boolean;
  share?: React.ReactNode;
}) {
  const characters = [scene.character_1_name, scene.character_2_name].filter(Boolean) as string[];
  const facts = [
    characters.join(" & ") || null,
    scene.line_count > 0 ? `${scene.line_count} lines` : null,
    formatSceneDuration(scene.estimated_duration_seconds),
  ].filter(Boolean) as string[];

  return (
    <div
      className={[
        "rounded-lg border border-l-2 border-border/70 px-5 py-5",
        accentClass,
      ].join(" ")}
    >
      <h3 className="font-sans text-base font-semibold text-foreground">{scene.title}</h3>
      {facts.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{facts.join("  ·  ")}</p>
      )}

      {/* Open, not folded. There is nothing to compare it against, so hiding it
          behind a chevron only adds a tap between the actor and the thing. */}
      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
        {scene.description?.trim() || "No synopsis for this scene yet."}
      </p>

      <button
        type="button"
        onClick={onOpen}
        disabled={opening}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 h-10 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {opening ? "Curtain up…" : "Open the scene"}
      </button>
      {share && <div className="mt-4">{share}</div>}
    </div>
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
