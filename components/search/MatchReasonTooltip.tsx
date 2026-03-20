"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MatchReason } from "@/lib/matchReasons";

const TYPE_STYLES: Record<MatchReason["type"], string> = {
  query: "bg-primary/15 text-primary dark:text-orange-400",
  filter: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  ai: "bg-muted text-muted-foreground",
  profile: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
};

const TYPE_LABELS: Record<MatchReason["type"], string> = {
  query: "Query",
  filter: "Filter",
  ai: "AI",
  profile: "Profile",
};

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
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Why this result matched"
          >
            <IconInfoCircle className="h-3.5 w-3.5" />
            <span>Why this result?</span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-[300px] p-3"
          onPointerDownOutside={(e) => e.stopPropagation()}
        >
          <p className="text-xs font-semibold mb-2">Why you got this result</p>
          <ul className="space-y-1.5">
            {reasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight ${TYPE_STYLES[reason.type]}`}>
                  {TYPE_LABELS[reason.type]}
                </span>
                <span className="leading-relaxed">{reason.detail}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
