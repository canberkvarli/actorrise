"use client";

import { useEffect, useRef, useState } from "react";
import { IconBookmark } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * Bookmark icon that delays the "filled" state by one frame when toggling ON,
 * so the CSS fill transition is visible (otherwise optimistic updates skip the transition).
 */
export interface BookmarkIconProps {
  filled: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClass = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" } as const;

export function BookmarkIcon({ filled, className, size = "md" }: BookmarkIconProps) {
  const [displayFilled, setDisplayFilled] = useState(filled);
  const prevFilled = useRef(filled);

  useEffect(() => {
    if (filled === prevFilled.current) return;
    prevFilled.current = filled;
    if (filled) {
      const id = requestAnimationFrame(() => setDisplayFilled(true));
      return () => cancelAnimationFrame(id);
    } else {
      setDisplayFilled(false);
    }
  }, [filled]);

  return (
    <IconBookmark
      className={cn(
        sizeClass[size],
        "transition-[fill] duration-200 ease-out",
        displayFilled && "fill-current",
        className
      )}
    />
  );
}
