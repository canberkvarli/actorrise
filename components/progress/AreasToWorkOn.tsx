"use client";

import { Card } from "@/components/ui/card";
import type { AreaToImprove } from "@/hooks/useRehearseStats";

export function AreasToWorkOn({ areas }: { areas: AreaToImprove[] }) {
  if (!areas || areas.length === 0) return null;

  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Areas to work on
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {areas.map((a) => (
          <span
            key={a.area}
            className="border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
          >
            {a.area}
            {a.count > 1 ? (
              <span className="text-muted-foreground"> · {a.count}</span>
            ) : null}
          </span>
        ))}
      </div>
    </Card>
  );
}
