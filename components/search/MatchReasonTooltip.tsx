"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MatchReason } from "@/lib/matchReasons";

interface MatchReasonTooltipProps {
  reasons: MatchReason[];
}

export function MatchReasonTooltip({ reasons }: MatchReasonTooltipProps) {
  if (reasons.length === 0) return null;

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer shrink-0"
            aria-label="Why this result matched"
          >
            <IconInfoCircle className="h-3 w-3" />
            <span>Why this?</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[280px] p-3"
          onPointerDownOutside={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((reason, i) => (
              <span
                key={i}
                className={`inline-flex px-2 py-0.5 text-[11px] leading-tight ${
                  reason.type === "profile"
                    ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
                    : "bg-primary/10 text-primary dark:text-orange-400"
                }`}
              >
                {reason.label}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
