"use client";

import { useState, useEffect, useRef } from "react";
import { IconExternalLink, IconSearch } from "@tabler/icons-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { FilmTvReference } from "@/types/filmTv";
import { getFilmTvScriptUrl, getScriptSlugUrl, getScriptSearchUrl } from "@/lib/utils";
import { toastScriptFeedback } from "@/lib/toast";

interface ScriptSourcePickerProps {
  ref_item: FilmTvReference;
  /** Use smaller padding for compact card layout */
  compact?: boolean;
}

const sources = [
  { key: "imsdb", label: "IMSDb", icon: IconExternalLink },
  { key: "scriptslug", label: "Script Slug", icon: IconExternalLink },
  { key: "google", label: "Google Search", icon: IconSearch },
] as const;

export function ScriptSourcePicker({ ref_item, compact }: ScriptSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [clickedSource, setClickedSource] = useState<string | null>(null);
  const feedbackShownRef = useRef(false);

  const urls: Record<string, string> = {
    imsdb: getFilmTvScriptUrl(ref_item),
    scriptslug: getScriptSlugUrl(ref_item.title, ref_item.year),
    google: getScriptSearchUrl(ref_item.title),
  };

  const handleLinkClick = (source: string) => {
    setClickedSource(source);
    feedbackShownRef.current = false;
    setOpen(false);
    window.open(urls[source], "_blank", "noopener,noreferrer");
  };

  useEffect(() => {
    if (!clickedSource || feedbackShownRef.current) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !feedbackShownRef.current) {
        feedbackShownRef.current = true;
        toastScriptFeedback(clickedSource, ref_item.title);
        setClickedSource(null);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [clickedSource, ref_item.title]);

  const btnClass = compact
    ? "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
    : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={btnClass}
        >
          <IconExternalLink className="h-3 w-3" />
          Script
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        {sources.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleLinkClick(key);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors text-left"
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
