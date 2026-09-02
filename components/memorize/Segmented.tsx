"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional accessible group label. */
  ariaLabel?: string;
  /** Compact padding (used for the tiny font-size control). */
  size?: "default" | "sm";
  /** Stretch to fill the container with equal-width segments. */
  fullWidth?: boolean;
  className?: string;
}

/** Refined segmented control. The active segment is a calm raised pill; orange
 *  appears only as a hairline ring + label tint, never as a big fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "default",
  fullWidth = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      /* Scrolls sideways rather than wrapping. With four segments at 390px the
         labels broke inside their own pills — "To study · 6" came out over three
         lines and dragged the whole control to three times its height. A
         segmented control that reflows is not one; it scrolls, and the scrollbar
         is hidden because the row is short enough to be obviously draggable. */
      className={cn(
        "items-center gap-1 rounded-full border border-border bg-muted/50 p-1",
        fullWidth ? "flex w-full" : "inline-flex max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full font-medium transition-colors cursor-pointer whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm sm:px-4",
              fullWidth ? "flex-1 text-center" : "shrink-0",
              active
                ? "bg-background text-primary shadow-sm ring-1 ring-primary/25"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
