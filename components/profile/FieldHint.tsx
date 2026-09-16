"use client";

import type { ReactNode } from "react";

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
  /* The hint hangs off the LABEL rather than off an icon beside it.
     An info circle per label meant eleven small circles down one column, which
     reads as eleven warnings; and the thing you had to hit was 14px wide. The
     question itself is the target now, marked by a dotted underline — the same
     mark the call sheet above uses for a blank waiting to be filled — with a
     44px hit area that takes no layout space. */
  if (!hint) {
    return (
      <div className={className}>
        <Label htmlFor={htmlFor}>{children}</Label>
      </div>
    );
  }

  return (
    <div className={className}>
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
            className="t-profile__why cursor-help focus:outline-none"
          >
            <Label htmlFor={htmlFor} className="pointer-events-none cursor-help">
              {children}
            </Label>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[17rem]">
          <p className="text-sm leading-relaxed">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
