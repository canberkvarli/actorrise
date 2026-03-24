"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MatchReason, MatchReasonCategory } from "@/lib/matchReasons";

const CATEGORY_STYLES: Record<MatchReasonCategory, string> = {
  score: "bg-muted text-foreground",
  quote: "bg-primary/12 text-primary dark:text-orange-400",
  emotion: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  tone: "bg-sky-500/12 text-sky-700 dark:text-sky-400",
  gender: "bg-pink-500/12 text-pink-700 dark:text-pink-400",
  theme: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  era: "bg-slate-500/12 text-slate-700 dark:text-slate-400",
  filter: "bg-teal-500/12 text-teal-700 dark:text-teal-400",
  profile: "bg-violet-500/12 text-violet-700 dark:text-violet-400",
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
                className={`inline-flex px-2 py-0.5 text-[11px] font-medium leading-tight capitalize ${CATEGORY_STYLES[reason.category]}`}
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
