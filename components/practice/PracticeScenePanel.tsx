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
} from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getGenreBadgeClassName } from "@/lib/genreColors";
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

  const scenes = data?.scenes ?? [];
  const groups = groupScenesByAct(scenes);
  const existingActs = [...new Set(scenes.map((s) => s.act).filter((a): a is string => !!a))];
  const canManage = !script.is_sample;
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  const refreshScenes = () =>
    queryClient.invalidateQueries({ queryKey: ["scripts", script.id] });

  const metaParts: string[] = [];
  if (script.author) metaParts.push(script.author);
  if (script.estimated_length_minutes) metaParts.push(`~${script.estimated_length_minutes} min`);
  if (script.num_scenes_extracted > 0)
    metaParts.push(`${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`);

  const sceneHref = (sceneId: number) => `/practice/${script.id}/scenes/${sceneId}/edit`;

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-5 border-b border-border/60">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="font-sans text-2xl md:text-3xl tracking-tight text-foreground">
              {script.title}
            </h2>
            {script.genre && (
              <span
                className={`inline-flex items-center border px-1.5 py-0.5 text-[10px] uppercase tracking-wide font-medium ${getGenreBadgeClassName(script.genre)}`}
              >
                {script.genre}
              </span>
            )}
          </div>
          {metaParts.length > 0 && (
            <p className="text-sm text-muted-foreground">{metaParts.join(" · ")}</p>
          )}
          {script.description && (
            <p className="text-sm text-muted-foreground/90 leading-relaxed max-w-prose line-clamp-2">
              {script.description}
            </p>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Body */}
      <div className="pt-6">
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
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-sans text-2xl md:text-3xl tracking-tight text-foreground">
                      {group.act}
                    </h3>
                    <span className="shrink-0 text-sm text-muted-foreground/60 tabular-nums">
                      {group.scenes.length} {group.scenes.length === 1 ? "scene" : "scenes"}
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {group.scenes.map((scene) => (
                    <SceneRow
                      key={scene.id}
                      scene={scene}
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
  expanded,
  onToggle,
  onOpen,
}: {
  scene: Scene;
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

  return (
    <div
      className={[
        "rounded-lg border transition-colors",
        expanded ? "border-[#CB4B00]/45 bg-muted/20" : "border-border/70 hover:border-border",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        onMouseEnter={() => {}}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-foreground truncate">
            {scene.scene_number ? `${scene.scene_number}. ` : ""}
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
                className="inline-flex items-center gap-1.5 rounded-md px-4 h-10 text-sm font-medium bg-[#CB4B00] text-white hover:bg-[#B03000] transition-colors"
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
