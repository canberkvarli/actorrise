"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useSavedScenes } from "@/hooks/useLibraryScenes";
import { useBookmarks } from "@/hooks/useBookmarks";
import { SceneCardGrid, SceneCardGridSkeleton } from "@/components/rehearse/SceneCardGrid";
import { MonologueCard } from "@/components/rehearse/MonologueCard";
import { EmptyState } from "@/components/rehearse/EmptyState";

export function SavedTab() {
  const { data: scenes, isLoading: scenesLoading } = useSavedScenes();
  const { data: monologues, isLoading: monologuesLoading } = useBookmarks({ alwaysFresh: true });

  const savedScenes = scenes ?? [];
  const savedMonologues = monologues ?? [];

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Saved scenes</h2>
        {scenesLoading ? (
          <SceneCardGridSkeleton count={3} />
        ) : savedScenes.length > 0 ? (
          <SceneCardGrid scenes={savedScenes} />
        ) : (
          <EmptyState
            title="No saved scenes yet"
            description="Bookmark scenes from the library to find them here."
            ctaLabel="Browse scenes"
            ctaHref="/rehearse?tab=scenes"
          />
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Saved monologues</h2>
        {monologuesLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : savedMonologues.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {savedMonologues.map((m) => (
              <MonologueCard key={m.id} monologue={m} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No saved monologues yet"
            description="Bookmark monologues to build your rehearsal list."
            ctaLabel="Browse monologues"
            ctaHref="/rehearse?tab=monologues"
          />
        )}
      </section>
    </div>
  );
}
