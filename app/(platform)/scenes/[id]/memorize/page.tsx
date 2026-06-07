"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IconArrowLeft } from "@tabler/icons-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemorizeView } from "@/components/memorize/MemorizeView";

interface SceneDetailLine {
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
}

interface SceneDetailResponse {
  id: number;
  title: string;
  play_title: string;
  play_author: string;
  character_1_name: string | null;
  character_2_name: string | null;
  lines: SceneDetailLine[];
}

const CONTAINER =
  "container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-3xl";

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="mb-6 hover:text-primary">
      <IconArrowLeft className="h-4 w-4" />
      Back
    </Button>
  );
}

export default function SceneMemorizePage() {
  const router = useRouter();
  const sceneId = useParams().id as string;
  const character = useSearchParams().get("character");

  const {
    data: scene,
    isLoading,
    isError,
    error,
  } = useQuery<SceneDetailResponse>({
    queryKey: ["scene-memorize", sceneId],
    queryFn: async () => {
      const res = await api.get<SceneDetailResponse>(`/api/scenes/${sceneId}`);
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className={CONTAINER}>
        <Skeleton className="h-9 w-24 mb-6" />
        <Skeleton className="h-9 w-3/4 mb-3" />
        <Skeleton className="h-5 w-1/2 mb-8" />
        <div className="space-y-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !scene) {
    return (
      <div className={CONTAINER}>
        <BackLink onClick={() => router.back()} />
        <h1 className="text-xl font-semibold">Couldn&apos;t load this scene</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Please try again."}
        </p>
      </div>
    );
  }

  const char1 = scene.character_1_name;
  const char2 = scene.character_2_name;
  const validCharacter =
    character != null && (character === char1 || character === char2);

  const choose = (name: string) => {
    const params = new URLSearchParams();
    params.set("character", name);
    router.replace(`/scenes/${sceneId}/memorize?${params.toString()}`);
  };

  if (!validCharacter) {
    return (
      <div className={CONTAINER}>
        <BackLink onClick={() => router.back()} />
        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
          {scene.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[scene.play_title, scene.play_author].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-8 mb-4 text-sm font-medium text-muted-foreground">
          Which role are you learning?
        </p>
        <div className="flex flex-wrap gap-3">
          {[char1, char2]
            .filter((c): c is string => Boolean(c))
            .map((name) => (
              <Button key={name} size="lg" onClick={() => choose(name)}>
                Play {name}
              </Button>
            ))}
        </div>
      </div>
    );
  }

  const lines = scene.lines.map((l) => ({
    speaker: l.character_name,
    text: l.text,
    mine: l.character_name === character,
    stageDirection: l.stage_direction,
  }));

  return (
    <div className={CONTAINER}>
      <BackLink onClick={() => router.back()} />
      <MemorizeView
        title={scene.title}
        subtitle={[scene.play_title, scene.play_author].filter(Boolean).join(" · ")}
        lines={lines}
      />
    </div>
  );
}
