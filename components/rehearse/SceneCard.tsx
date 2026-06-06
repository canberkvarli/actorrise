"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { useToggleSceneFavorite } from "@/hooks/useSceneFavorites";
import type { SceneResponse } from "@/hooks/useLibraryScenes";

function joinWithDot(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

function buildMeta(scene: SceneResponse): string {
  const parts: string[] = [];
  if (scene.estimated_duration_seconds != null) {
    const mins = Math.max(1, Math.round(scene.estimated_duration_seconds / 60));
    parts.push(`~${mins} min`);
  }
  if (scene.line_count != null) {
    parts.push(`${scene.line_count} lines`);
  }
  return parts.join(" · ");
}

/**
 * A curated library scene in the Practice hub. Practice is memorization-only —
 * AI scene rehearsal lives in My Scripts — so the action here is "Memorize".
 */
export function SceneCard({ scene }: { scene: SceneResponse }) {
  const router = useRouter();
  const toggle = useToggleSceneFavorite();

  const characters = joinWithDot([scene.character_1_name, scene.character_2_name]);
  const meta = buildMeta(scene);

  return (
    <Card className="group relative flex h-full flex-col gap-3 p-6 transition-shadow hover:shadow-md">
      <button
        type="button"
        aria-label={scene.is_favorited ? "Remove from saved" : "Save scene"}
        onClick={() =>
          toggle.mutate({ sceneId: scene.id, isFavorited: scene.is_favorited })
        }
        className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:text-primary"
      >
        <BookmarkIcon filled={scene.is_favorited} size="md" />
      </button>

      <div className="pr-8">
        <h3 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{scene.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {joinWithDot([scene.play_title, scene.play_author])}
        </p>
      </div>

      {characters && (
        <p className="text-sm text-foreground/80">{characters}</p>
      )}

      {meta && <p className="text-xs text-muted-foreground">{meta}</p>}

      {scene.primary_emotions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scene.primary_emotions.slice(0, 4).map((emotion) => (
            <span
              key={emotion}
              className="border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {emotion}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-2">
        <Button
          size="sm"
          onClick={() => router.push(`/scenes/${scene.id}/memorize`)}
        >
          Memorize
        </Button>
      </div>
    </Card>
  );
}
