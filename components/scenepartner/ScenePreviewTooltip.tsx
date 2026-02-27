"use client";

import { useState, useRef, useCallback } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const MAX_PREVIEW_LINES = 6;

// Simple in-memory cache so we don't re-fetch on every hover
const lineCache = new Map<number, SceneLine[]>();

interface ScenePreviewTooltipProps {
  sceneId: number;
  children: React.ReactNode;
}

export function ScenePreviewTooltip({ sceneId, children }: ScenePreviewTooltipProps) {
  const [lines, setLines] = useState<SceneLine[] | null>(lineCache.get(sceneId) ?? null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

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
      // Silently fail — tooltip just won't show preview
    } finally {
      setLoading(false);
    }
  }, [sceneId, lines]);

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild onMouseEnter={fetchLines}>
        {children}
      </TooltipTrigger>
      <TooltipContent
        side="right"
        align="start"
        className="max-w-sm p-3 bg-neutral-900 border-neutral-700"
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
              <p className="text-[10px] text-neutral-500 italic">...</p>
            )}
          </div>
        )}
        {lines && lines.length === 0 && (
          <p className="text-xs text-neutral-500 italic">No lines</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
