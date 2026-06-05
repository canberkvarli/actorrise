"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { useLibraryScenes } from "@/hooks/useLibraryScenes";
import { useScripts } from "@/hooks/useScripts";
import { SceneCardGrid, SceneCardGridSkeleton } from "@/components/rehearse/SceneCardGrid";
import { ScriptCard } from "@/components/rehearse/ScriptCard";
import { EmptyState } from "@/components/rehearse/EmptyState";

export function ScenesTab() {
  const [q, setQ] = useState("");

  const { data: scenes, isLoading } = useLibraryScenes({ q });
  const { data: scripts } = useScripts();

  const userScripts = useMemo(
    () => (scripts ?? []).filter((s) => !s.is_sample),
    [scripts],
  );

  return (
    <div className="space-y-10">
      <div className="relative max-w-md">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search scenes, plays, characters…"
          className="pl-9"
        />
      </div>

      <section className="space-y-4">
        {isLoading ? (
          <SceneCardGridSkeleton />
        ) : scenes && scenes.length > 0 ? (
          <SceneCardGrid scenes={scenes} />
        ) : (
          <EmptyState
            title="No scenes found"
            description="Try clearing your search."
          />
        )}
      </section>

      {userScripts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">From your scripts</h2>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {userScripts.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
