"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconLock, IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { useToggleSceneFavorite } from "@/hooks/useSceneFavorites";
import { useSubscription } from "@/hooks/useSubscription";
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

export function SceneCard({ scene }: { scene: SceneResponse }) {
  const router = useRouter();
  const toggle = useToggleSceneFavorite();
  const { subscription } = useSubscription();
  const userTier = subscription?.tier_name || "free";

  // "rehearse" cards start a fresh session, then jump into the rehearsal screen.
  // Pick a role first (every scene is a two-hander) so the AI plays the other.
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);

  const characters = joinWithDot([scene.character_1_name, scene.character_2_name]);
  const meta = buildMeta(scene);

  // Free actors get the demo + a curated starter set of library scenes; the
  // rest of the catalog is a Plus perk, flagged up-front so there's no
  // mid-rehearsal wall.
  const isLocked = scene.is_library && !scene.is_free_library && userTier === "free";

  const startRehearsal = async (userCharacter: string) => {
    setStarting(true);
    try {
      const { data } = await api.post<{ id: number }>(
        "/api/scenes/rehearse/start",
        { scene_id: scene.id, user_character: userCharacter },
      );
      router.push(`/scenes/${scene.id}/rehearse?session=${data.id}`);
    } catch (err) {
      setStarting(false);
      setPicking(false);
      toast.error(
        err instanceof Error ? err.message : "Couldn't start the rehearsal.",
      );
    }
  };

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
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{scene.title}</h3>
          {isLocked && (
            <span className="inline-flex shrink-0 items-center gap-1 border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              <IconLock className="h-3 w-3" />
              Plus
            </span>
          )}
        </div>
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
        {isLocked ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push("/pricing")}
          >
            Upgrade to rehearse
          </Button>
        ) : starting ? (
          <Button size="sm" disabled>
            <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
            Starting…
          </Button>
        ) : picking ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Which role do you want to play?
            </p>
            <div className="flex flex-wrap gap-2">
              {[scene.character_1_name, scene.character_2_name]
                .filter((c): c is string => Boolean(c))
                .map((char) => (
                  <Button
                    key={char}
                    size="sm"
                    onClick={() => startRehearsal(char)}
                  >
                    {char}
                  </Button>
                ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPicking(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={() => setPicking(true)}>
            Rehearse
          </Button>
        )}
      </div>
    </Card>
  );
}
