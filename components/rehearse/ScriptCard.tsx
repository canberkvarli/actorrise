"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { UserScript } from "@/hooks/useScripts";

export function ScriptCard({ script }: { script: UserScript }) {
  const sceneLabel =
    script.num_scenes_extracted === 1
      ? "1 scene"
      : `${script.num_scenes_extracted} scenes`;

  return (
    <Link href={`/practice?script=${script.id}`} className="block">
      <Card className="flex flex-col gap-1 p-5 transition-shadow hover:shadow-md">
        <h3 className="font-bold leading-tight tracking-tight">{script.title}</h3>
        <p className="text-sm text-muted-foreground">{sceneLabel}</p>
      </Card>
    </Link>
  );
}
