"use client";

import { useRouter } from "next/navigation";
import { IconChevronRight, IconLoader2 } from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getGenreBadgeClassName } from "@/lib/genreColors";
import { useScript, type UserScript } from "@/hooks/useScripts";
import { groupScenesByAct, formatSceneDuration, type Scene } from "@/lib/scenes";

type ScriptWithScenes = UserScript & { scenes: Scene[] };

interface PracticeScenePanelProps {
  /** The selected script from the list (used for an instant header). */
  script: UserScript;
}

/**
 * Right pane of the /practice library: the selected script's scenes, grouped by
 * act. Tapping a scene opens it in the editor, where you review it and start the
 * rehearsal. Scenes load lazily for the selected script only.
 */
export function PracticeScenePanel({ script }: PracticeScenePanelProps) {
  const router = useRouter();
  const { data, isLoading } = useScript(script.id) as {
    data: ScriptWithScenes | undefined;
    isLoading: boolean;
  };

  const scenes = data?.scenes ?? [];
  const groups = groupScenesByAct(scenes);
  const isProcessing =
    script.processing_status === "processing" || script.processing_status === "pending";
  const isFailed = script.processing_status === "failed";

  const metaParts: string[] = [];
  if (script.author) metaParts.push(script.author);
  if (script.estimated_length_minutes)
    metaParts.push(`~${script.estimated_length_minutes} min`);
  if (script.num_scenes_extracted > 0)
    metaParts.push(
      `${script.num_scenes_extracted} scene${script.num_scenes_extracted !== 1 ? "s" : ""}`,
    );

  const sceneHref = (sceneId: number) =>
    `/practice/${script.id}/scenes/${sceneId}/edit`;

  return (
    <div className="min-w-0">
      {/* Header */}
      <div className="space-y-2 pb-5 border-b border-border/60">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <h2 className="font-serif text-2xl md:text-3xl tracking-tight text-foreground">
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
            We couldn&apos;t extract scenes from this script. Open it to retry or re-upload.
          </StatusNote>
        ) : isLoading && scenes.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <StatusNote>No scenes found in this script yet.</StatusNote>
        ) : (
          <div className="space-y-8">
            {groups.map((group, gi) => (
              <div key={group.act ?? `g${gi}`} className="space-y-3">
                {group.act && (
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-serif text-2xl md:text-3xl tracking-tight text-foreground">
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
                      onOpen={() => router.push(sceneHref(scene.id))}
                      onPrefetch={() => router.prefetch(sceneHref(scene.id))}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SceneRow({
  scene,
  onOpen,
  onPrefetch,
}: {
  scene: Scene;
  onOpen: () => void;
  onPrefetch: () => void;
}) {
  const characters = [scene.character_1_name, scene.character_2_name].filter(Boolean);
  const duration = formatSceneDuration(scene.estimated_duration_seconds);

  const subParts: string[] = [];
  if (characters.length > 0) subParts.push(characters.join(" & "));
  if (duration) subParts.push(duration);
  if (scene.line_count > 0) subParts.push(`${scene.line_count} lines`);

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onPrefetch}
      onTouchStart={onPrefetch}
      onFocus={onPrefetch}
      className="group w-full flex items-center gap-3 rounded-lg border border-border/70 px-4 py-3 text-left transition-colors hover:border-border hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm text-foreground truncate">
          {scene.scene_number ? `${scene.scene_number}. ` : ""}
          {scene.title}
        </p>
        {subParts.length > 0 && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {subParts.join(" · ")}
          </p>
        )}
      </div>
      <IconChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
    </button>
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
