"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { RehearseSession } from "@/hooks/useRehearseSessions";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SessionRow({ session }: { session: RehearseSession }) {
  const pct = Math.round(session.completion_percentage ?? 0);
  const date = formatDate(session.started_at);

  return (
    <Link
      href={`/scenes/${session.scene_id}/rehearse`}
      className="block rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">
          {session.user_character}{" "}
          <span className="text-muted-foreground">vs</span>{" "}
          {session.ai_character}
        </p>
        <p className="text-xs text-muted-foreground">
          {date ? <>{date} · </> : null}Scene #{session.scene_id}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Progress value={pct} className="h-1.5" />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {pct}%
        </span>
      </div>
    </Link>
  );
}

export function RecentSessions({ sessions }: { sessions: RehearseSession[] }) {
  if (!sessions || sessions.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight text-foreground">
        Recent sessions
      </h2>
      <div className="space-y-2">
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </div>
    </section>
  );
}
