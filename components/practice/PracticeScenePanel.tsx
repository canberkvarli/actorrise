"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconChevronDown,
  IconArrowRight,
  IconLoader2,
  IconPlus,
  IconPencil,
  IconRefresh,
} from "@tabler/icons-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getGenreBadgeClassName,
  getGenreBorderClassName,
  getGenreDotClassName,
} from "@/lib/genreColors";
import { useScript, type UserScript } from "@/hooks/useScripts";
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
  const queryClient = useQueryClient();
  const { data, isLoading } = useScript(script.id) as {
    data: ScriptWithScenes | undefined;
    isLoading: boolean;
  };

  const [expandedSceneId, setExpandedSceneId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [redoing, setRedoing] = useState(false);

  const scenes = data?.scenes ?? [];
  const groups = groupScenesByAct(scenes);
  const existingActs = [...new Set(scenes.map((s) => s.act).filter((a): a is string => !!a))];
  const canManage = !script.is_sample;
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  const refreshScenes = () =>
    queryClient.invalidateQueries({ queryKey: ["scripts", script.id] });

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

  const sceneHref = (sceneId: number) => `/practice/${script.id}/scenes/${sceneId}/edit`;

  return (
    // The selected script, opened like a playbook: title page on the left,
    // the scenes on the right. Same spine color as its card on the shelf,
    // so the eye connects the two.
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-border/60 bg-card/40 md:grid md:grid-cols-[280px_minmax(0,1fr)]">
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${getGenreDotClassName(script.genre)} opacity-70`}
      />

      {/* Title page */}
      <div className="flex min-w-0 flex-col gap-3 border-b border-border/60 px-5 py-5 sm:px-6 md:border-b-0 md:border-r">
        <div>
          <h2 className="font-brand text-2xl font-medium tracking-tight text-foreground text-balance">
            {script.title}
          </h2>
          {script.genre && (
            <span
              className={`mt-2 inline-flex items-center border px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium ${getGenreBadgeClassName(script.genre)}`}
            >
              {script.genre}
            </span>
          )}
        </div>
        {metaParts.length > 0 && (
          <p className="text-sm text-muted-foreground">{metaParts.join(" · ")}</p>
        )}
        {script.description && (
          <p className="text-sm text-muted-foreground/90 leading-relaxed line-clamp-5">
            {script.description}
          </p>
        )}

        {canManage && (
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <IconPencil className="h-3.5 w-3.5" />
              Edit details
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 h-8 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
            >
              <IconPlus className="h-3.5 w-3.5" />
              Add scene
            </button>
            {scenes.length > 0 && (
              <button
                type="button"
                onClick={redoScenes}
                disabled={redoing}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
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

      {/* The scenes */}
      <div className="min-w-0 px-5 py-5 sm:px-6">
        {isProcessing ? (
          <StatusNote>
            <IconLoader2 className="h-4 w-4 animate-spin" />
            Still pulling scenes out of this script. Hang tight.
          </StatusNote>
        ) : isFailed ? (
          <StatusNote tone="error">
            We couldn&apos;t extract scenes from this script. Try re-uploading, or flag it from the menu.
          </StatusNote>
        ) : isLoading && scenes.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <StatusNote>No scenes yet. Use “Add scene” to create one.</StatusNote>
        ) : (
          <div className="space-y-8">
            {groups.map((group, gi) => (
              <div key={group.act ?? `g${gi}`} className="space-y-3">
                {group.act && (
                  <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-4">
                    <h3 className="font-brand text-xl md:text-2xl font-medium tracking-tight text-foreground">
                      {group.act}
                    </h3>
                    <span className="shrink-0 font-typewriter text-xs italic text-muted-foreground/60 tabular-nums">
                      ({group.scenes.length} {group.scenes.length === 1 ? "scene" : "scenes"}.)
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {group.scenes.map((scene) => (
                    <SceneRow
                      key={scene.id}
                      scene={scene}
                      accentClass={getGenreBorderClassName(script.genre ?? "")}
                      expanded={expandedSceneId === scene.id}
                      onToggle={() => {
                        setExpandedSceneId((cur) => (cur === scene.id ? null : scene.id));
                        router.prefetch(sceneHref(scene.id));
                      }}
                      onOpen={() => router.push(sceneHref(scene.id))}
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
        </>
      )}
    </div>
  );
}

function SceneRow({
  scene,
  accentClass,
  expanded,
  onToggle,
  onOpen,
}: {
  scene: Scene;
  /** Genre-tinted left edge (border-l-* class from genreColors). */
  accentClass: string;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
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
    <div
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
    </div>
  );
}

function StatusNote({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={[
        "flex items-center justify-center gap-2 border border-dashed px-4 py-8 text-sm text-center",
        tone === "error"
          ? "border-destructive/30 text-destructive"
          : "border-border/60 text-muted-foreground",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export default PracticeScenePanel;
