"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Monologue } from "@/types/actor";

function joinWithDot(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

export function MonologueCard({ monologue }: { monologue: Monologue }) {
  const meta: string[] = [];
  if (monologue.difficulty_level) {
    meta.push(
      monologue.difficulty_level.charAt(0).toUpperCase() + monologue.difficulty_level.slice(1),
    );
  }
  if (monologue.estimated_duration_seconds != null) {
    const mins = Math.max(1, Math.round(monologue.estimated_duration_seconds / 60));
    meta.push(`~${mins} min`);
  }

  return (
    <Link href={`/monologue/${monologue.id}`} className="block">
      <Card className="flex flex-col gap-2 p-5 transition-shadow hover:shadow-md">
        <h3 className="font-bold leading-tight tracking-tight">{monologue.title}</h3>
        <p className="text-sm text-muted-foreground">
          {joinWithDot([monologue.character_name, monologue.play_title, monologue.author])}
        </p>
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
        )}
      </Card>
    </Link>
  );
}
