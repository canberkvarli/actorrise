"use client";

/**
 * Usage Meter Component
 *
 * Displays usage progress bar with current usage vs. limit.
 * Shows warning when approaching limit and optional upgrade prompt.
 */

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { IconArrowUpRight } from "@tabler/icons-react";

interface UsageMeterProps {
  used: number;
  limit: number;
  label: string;
  showUpgrade?: boolean;
  upgradeUrl?: string;
}

export function UsageMeter({
  used,
  limit,
  label,
  showUpgrade = false,
  upgradeUrl = "/pricing",
}: UsageMeterProps) {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = percentage > 80;
  const isAtLimit = percentage >= 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">
          {used} / {isUnlimited ? "∞" : limit}
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${isAtLimit ? "bg-destructive/20" : isNearLimit ? "bg-accent/20" : ""}`}
      />
      {isNearLimit && !isUnlimited && showUpgrade && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isAtLimit ? "Limit reached" : "Running low"}
          </p>
          <Button asChild size="sm" variant="ghost" className="h-6 text-xs">
            <Link href={upgradeUrl}>
              Upgrade
              <IconArrowUpRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
