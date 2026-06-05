"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLibraryScenes } from "@/hooks/useLibraryScenes";
import { useScripts } from "@/hooks/useScripts";
import { SceneCardGrid, SceneCardGridSkeleton } from "@/components/rehearse/SceneCardGrid";
import { ScriptCard } from "@/components/rehearse/ScriptCard";
import { EmptyState } from "@/components/rehearse/EmptyState";

const DIFFICULTIES = [
  { label: "All", value: undefined },
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
] as const;

export function ScenesTab() {
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined);
  const [q, setQ] = useState("");

  const { data: scenes, isLoading } = useLibraryScenes({ difficulty, q });
  const { data: scripts } = useScripts();

  const userScripts = useMemo(
    () => (scripts ?? []).filter((s) => !s.is_sample),
    [scripts],
  );

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {DIFFICULTIES.map((d) => {
            const active = difficulty === d.value;
            return (
              <button
                key={d.label}
                type="button"
                onClick={() => setDifficulty(d.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>

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
      </div>

      <section className="space-y-4">
        {isLoading ? (
          <SceneCardGridSkeleton />
        ) : scenes && scenes.length > 0 ? (
          <SceneCardGrid scenes={scenes} />
        ) : (
          <EmptyState
            title="No scenes found"
            description="Try a different difficulty or clear your search."
          />
        )}
      </section>

      {userScripts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold tracking-tight">From your scripts</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {userScripts.map((script) => (
              <ScriptCard key={script.id} script={script} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
