"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MatchReason, MatchReasonCategory } from "@/lib/matchReasons";

const CATEGORY_TEXT_COLOR: Record<MatchReasonCategory, string> = {
  score: "text-foreground font-semibold",
  quote: "text-primary dark:text-orange-400 font-semibold",
  emotion: "text-emerald-700 dark:text-emerald-400 font-semibold",
  tone: "text-sky-700 dark:text-sky-400 font-semibold",
  gender: "text-pink-700 dark:text-pink-400 font-semibold",
  theme: "text-amber-700 dark:text-amber-400 font-semibold",
  era: "text-slate-700 dark:text-slate-400 font-semibold",
  filter: "text-teal-700 dark:text-teal-400 font-semibold",
  profile: "text-violet-700 dark:text-violet-400 font-semibold",
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
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
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
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {reasons.map((reason, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <span className={CATEGORY_TEXT_COLOR[reason.category]}>
                  {reason.label}
                </span>
              </span>
            ))}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
