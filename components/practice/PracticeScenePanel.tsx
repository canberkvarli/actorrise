"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconArrowRight, IconChevronDown, IconLoader2 } from "@tabler/icons-react";

import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { getGenreBadgeClassName } from "@/lib/genreColors";
import { useScript, type UserScript } from "@/hooks/useScripts";
import { useStartRehearsal } from "@/hooks/useStartRehearsal";
import { groupScenesByAct, formatSceneDuration, type Scene } from "@/lib/scenes";

type ScriptWithScenes = UserScript & { scenes: Scene[] };

interface PracticeScenePanelProps {
  /** The selected script from the list (used for an instant header). */
  script: UserScript;
}

/**
 * Right pane of the /practice library: the selected script's scenes, grouped by
 * act. Tap a scene to expand it, pick which character you'll read, and rehearse
 * without leaving the page. Scenes load lazily for the selected script only.
 */
export function PracticeScenePanel({ script }: PracticeScenePanelProps) {
  const { data, isLoading } = useScript(script.id) as {
    data: ScriptWithScenes | undefined;
    isLoading: boolean;
  };
  const { startRehearsal, startingSceneId, upgradeModal, setUpgradeModal } =
    useStartRehearsal();
  const [expandedSceneId, setExpandedSceneId] = useState<number | null>(null);

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
      <div className="pt-5">
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
          <div className="space-y-6">
            {groups.map((group, gi) => (
              <div key={group.act ?? `g${gi}`} className="space-y-1.5">
                {group.act && (
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <h3 className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-medium">
                      {group.act}
                    </h3>
                    <span className="text-xs text-muted-foreground/60 tabular-nums">
                      {group.scenes.length}
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  {group.scenes.map((scene) => (
                    <SceneRow
                      key={scene.id}
                      scene={scene}
                      expanded={expandedSceneId === scene.id}
                      onToggle={() =>
                        setExpandedSceneId((cur) => (cur === scene.id ? null : scene.id))
                      }
                      starting={startingSceneId === scene.id}
                      onRehearse={() => startRehearsal(scene.id, scene.character_1_name)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <UpgradeModal
        open={upgradeModal.open}
        onOpenChange={(open) => setUpgradeModal((prev) => ({ ...prev, open }))}
        feature={upgradeModal.feature}
        message={upgradeModal.message}
      />
    </div>
  );
}

function SceneRow({
  scene,
  expanded,
  onToggle,
  starting,
  onRehearse,
}: {
  scene: Scene;
  expanded: boolean;
  onToggle: () => void;
  starting: boolean;
  onRehearse: () => void;
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
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
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
              {scene.description && (
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                  {scene.description}
                </p>
              )}

              <button
                type="button"
                onClick={onRehearse}
                disabled={starting}
                className={[
                  "inline-flex items-center gap-1.5 rounded-md px-4 h-10 text-sm font-medium",
                  "bg-[#CB4B00] text-white hover:bg-[#B03000] transition-colors",
                  "disabled:opacity-70 disabled:cursor-not-allowed",
                ].join(" ")}
              >
                {starting ? (
                  <>
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    Rehearse this scene
                    <IconArrowRight className="h-4 w-4" />
                  </>
                )}
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
        "flex items-center gap-2 border border-dashed px-4 py-8 text-sm justify-center text-center",
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
