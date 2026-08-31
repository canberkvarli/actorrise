"use client";

import type { ReactNode } from "react";
import { IconInfoCircle } from "@tabler/icons-react";

import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A label that can say why it is asking.
 *
 * Three fields had an info circle and eight didn't, which reads as "these three
 * are confusing" rather than "here is the reasoning". Every question on this
 * form is personal — gender, ethnicity, height, union — and an actor is
 * entitled to know what each one does before answering it. The hint is the
 * answer to "why do you want to know?", not a restatement of the label.
 *
 * Requires a TooltipProvider ancestor (the form supplies one).
 */

export function FieldLabel({
  htmlFor,
  children,
  hint,
  className = "",
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
      </Label>
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              // Not aria-label="info" — a screen reader user should hear which
              // field the explanation belongs to.
              aria-label={
                typeof children === "string"
                  ? `Why ${children.toLowerCase()} is asked`
                  : "Why this is asked"
              }
              className="inline-flex cursor-help items-center rounded-sm text-muted-foreground/60 transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <IconInfoCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[17rem]">
            <p className="text-sm leading-relaxed">{hint}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
