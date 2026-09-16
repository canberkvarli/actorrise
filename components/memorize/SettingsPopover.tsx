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

/** The reading choices: size, ground, face, spacing. */
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
        aria-pressed={open}
        className="t-mem__toggle"
      >
        reading
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reading settings"
          className="t-mem__panel space-y-4"
        >
          <div className="space-y-2">
            <p className="t-mem__panel-head">Text size</p>
            <Segmented
              ariaLabel="Text size"
              size="sm"
              fullWidth
              options={FONT_SIZE_OPTIONS}
              value={prefs.fontSize}
              onChange={(v) => update({ fontSize: v })}
            />
          </div>

          <div className="space-y-2">
            <p className="t-mem__panel-head">Paper</p>
            <Segmented
              ariaLabel="Reading theme"
              size="sm"
              fullWidth
              options={THEME_OPTIONS}
              value={prefs.theme}
              onChange={(v) => update({ theme: v })}
            />
          </div>

          <div className="t-mem__panel-row">
            <span>Plain type</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.plainType}
              onClick={() => update({ plainType: !prefs.plainType })}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors cursor-pointer",
                prefs.plainType ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                  prefs.plainType ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          <div className="t-mem__panel-row">
            <span>Relaxed spacing</span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.spacious}
              onClick={() => update({ spacious: !prefs.spacious })}
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors cursor-pointer",
                prefs.spacious ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                  prefs.spacious ? "translate-x-5" : "translate-x-0",
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
