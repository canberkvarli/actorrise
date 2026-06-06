"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Segmented } from "./Segmented";
import {
  FONT_SIZE_OPTIONS,
  THEME_OPTIONS,
  type MemorizePrefs,
} from "./prefs";

interface SettingsPopoverProps {
  prefs: MemorizePrefs;
  update: (patch: Partial<MemorizePrefs>) => void;
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Gear button that opens a calm reading-settings panel. */
export function SettingsPopover({ prefs, update }: SettingsPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Reading settings"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors cursor-pointer hover:text-foreground hover:bg-muted/50",
          open && "text-foreground bg-muted/50",
        )}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reading settings"
          className="absolute right-0 z-20 mt-2 w-72 space-y-4 rounded-xl border border-border bg-popover p-4 shadow-lg"
        >
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Text size
            </p>
            <Segmented
              ariaLabel="Text size"
              size="sm"
              options={FONT_SIZE_OPTIONS}
              value={prefs.fontSize}
              onChange={(v) => update({ fontSize: v })}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reading theme
            </p>
            <Segmented
              ariaLabel="Reading theme"
              size="sm"
              options={THEME_OPTIONS}
              value={prefs.theme}
              onChange={(v) => update({ theme: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Serif type</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.serif}
              onClick={() => update({ serif: !prefs.serif })}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors cursor-pointer",
                prefs.serif ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                  prefs.serif ? "translate-x-[22px]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">Relaxed spacing</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.spacious}
              onClick={() => update({ spacious: !prefs.spacious })}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors cursor-pointer",
                prefs.spacious ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                  prefs.spacious ? "translate-x-[22px]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPopover;
