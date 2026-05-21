"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface SceneLine {
  id: number;
  line_order: number;
  character_name: string;
  text: string;
  stage_direction: string | null;
}

interface SceneWithLines {
  lines: SceneLine[];
}

const MAX_PREVIEW_LINES = 20;

// Simple in-memory cache so we don't re-fetch on every hover
const lineCache = new Map<number, SceneLine[]>();

interface ScenePreviewTooltipProps {
  sceneId: number;
  children: React.ReactNode;
}

export function ScenePreviewTooltip({ sceneId, children }: ScenePreviewTooltipProps) {
  const [lines, setLines] = useState<SceneLine[] | null>(lineCache.get(sceneId) ?? null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [popoverAlign, setPopoverAlign] = useState<"start" | "end">("start");

  const fetchLines = useCallback(async () => {
    if (fetchedRef.current || lineCache.has(sceneId)) {
      if (!lines && lineCache.has(sceneId)) setLines(lineCache.get(sceneId)!);
      return;
    }
    fetchedRef.current = true;
    setLoading(true);
    try {
      const { data } = await api.get<SceneWithLines>(`/api/scenes/${sceneId}`);
      const sorted = data.lines
        .slice()
        .sort((a, b) => a.line_order - b.line_order)
        .slice(0, MAX_PREVIEW_LINES);
      lineCache.set(sceneId, sorted);
      setLines(sorted);
    } catch {
      // Silently fail — popover just won't show preview
    } finally {
      setLoading(false);
    }
  }, [sceneId, lines]);

  const handleMouseEnter = useCallback(() => {
    fetchLines();
    // Detect if trigger is near bottom of viewport
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setPopoverAlign(spaceBelow < 280 ? "end" : "start");
    }
    hoverTimeoutRef.current = setTimeout(() => setOpen(true), 300);
  }, [fetchLines]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div
          ref={triggerRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align={popoverAlign}
        sideOffset={8}
        onMouseEnter={() => {
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        }}
        onMouseLeave={handleMouseLeave}
        className="max-w-sm w-72 p-3 bg-neutral-900 border-neutral-700 max-h-[280px] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {loading && !lines && (
          <div className="space-y-2 w-48">
            <Skeleton className="h-3 w-full bg-neutral-800" />
            <Skeleton className="h-3 w-3/4 bg-neutral-800" />
            <Skeleton className="h-3 w-full bg-neutral-800" />
          </div>
        )}
        {lines && lines.length > 0 && (
          <div className="space-y-2">
            {lines.map((line) => (
              <div key={line.id}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  {line.character_name}
                </span>
                {line.stage_direction && (
                  <span className="text-[10px] italic text-neutral-500 ml-1">
                    ({line.stage_direction})
                  </span>
                )}
                <p className="text-xs text-neutral-200 leading-snug line-clamp-2">
                  {line.text}
                </p>
              </div>
            ))}
            {lines.length === MAX_PREVIEW_LINES && (
              <p className="text-[10px] text-neutral-500 italic">Scroll for more...</p>
            )}
          </div>
        )}
        {lines && lines.length === 0 && (
          <p className="text-xs text-neutral-500 italic">No lines</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
