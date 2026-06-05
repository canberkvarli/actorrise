"use client";

import { Card } from "@/components/ui/card";
import type { RehearseStats } from "@/hooks/useRehearseStats";

function StatCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-1 min-h-[1.25rem] text-sm text-muted-foreground">
        {subtext ?? ""}
      </p>
    </Card>
  );
}

export function StatCards({ stats }: { stats: RehearseStats }) {
  const streakUnit = stats.current_streak === 1 ? "day" : "days";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        label="Current streak"
        value={`${stats.current_streak} ${streakUnit}`}
        subtext={`Longest: ${stats.longest_streak}`}
      />
      <StatCard
        label="Sessions"
        value={`${stats.completed_sessions}`}
        subtext={`of ${stats.total_sessions} completed`}
      />
      <StatCard
        label="Average rating"
        value={`${stats.average_rating?.toFixed(1) ?? "—"} / 5`}
      />
    </div>
  );
}
