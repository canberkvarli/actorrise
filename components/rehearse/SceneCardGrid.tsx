"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SceneCard } from "@/components/rehearse/SceneCard";
import type { SceneResponse } from "@/hooks/useLibraryScenes";

export function SceneCardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-52 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function SceneCardGrid({ scenes }: { scenes: SceneResponse[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {scenes.map((scene) => (
        <SceneCard key={scene.id} scene={scene} />
      ))}
    </div>
  );
}
