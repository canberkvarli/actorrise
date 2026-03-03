"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Headshot {
  url: string;
  is_primary?: boolean;
  caption?: string;
}

interface HeadshotGalleryProps {
  headshots: Headshot[];
  name: string;
  className?: string;
}

export function HeadshotGallery({ headshots, name, className }: HeadshotGalleryProps) {
  const primaryIndex = headshots.findIndex((h) => h.is_primary);
  const [activeIndex, setActiveIndex] = useState(primaryIndex >= 0 ? primaryIndex : 0);

  if (headshots.length === 0) return null;

  const active = headshots[activeIndex];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Main headshot */}
      <div className="relative w-full aspect-[4/5] rounded-lg overflow-hidden bg-muted ring-2 ring-border/50 shadow-lg">
        <Image
          src={active.url}
          alt={`${name} headshot`}
          fill
          className="object-cover object-top"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          priority
        />
      </div>

      {/* Thumbnails (only if more than 1 headshot) */}
      {headshots.length > 1 && (
        <div className="flex gap-2 justify-center">
          {headshots.map((h, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIndex(i)}
              className={cn(
                "relative w-16 h-20 rounded-md overflow-hidden border-2 transition-all",
                i === activeIndex
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent hover:border-muted-foreground/30",
              )}
            >
              <Image
                src={h.url}
                alt={h.caption || `${name} headshot ${i + 1}`}
                fill
                className="object-cover object-top"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}

      {/* Caption */}
      {active.caption && (
        <p className="text-xs text-muted-foreground text-center">{active.caption}</p>
      )}
    </div>
  );
}
