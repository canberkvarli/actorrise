"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconStar, IconExternalLink, IconPhoto } from "@tabler/icons-react";
import { motion } from "framer-motion";
import Image from "next/image";
import type { FilmTvReference } from "@/types/filmTv";
import { getImsdbSearchUrl } from "@/lib/utils";

export interface FilmTvReferenceCardProps {
  ref_item: FilmTvReference;
  onSelect?: () => void;
  index?: number;
  /** Compact = same size/style as monologue cards (one line, no new lines) */
  compact?: boolean;
}

export function FilmTvReferenceCard({
  ref_item,
  onSelect,
  index = 0,
  compact = false,
}: FilmTvReferenceCardProps) {
  const [posterError, setPosterError] = useState(false);
  const typeLabel = ref_item.type === "tvSeries" ? "TV Series" : ref_item.type === "movie" ? "Movie" : null;
  const genres = ref_item.genre?.slice(0, 3) ?? [];
  const actorList = ref_item.actors?.slice(0, 3) ?? [];

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
      >
        <div
          className="group p-6 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full flex flex-col min-h-[200px]"
          onClick={onSelect}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="shrink-0 w-11 h-14 rounded overflow-hidden bg-muted flex items-center justify-center">
              {ref_item.poster_url && !posterError ? (
                <Image
                  src={ref_item.poster_url}
                  alt={ref_item.title}
                  width={44}
                  height={56}
                  className="object-cover w-full h-full"
                  unoptimized
                  onError={() => setPosterError(true)}
                />
              ) : (
                <IconPhoto className="h-5 w-5 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {ref_item.title}
              </h3>
              <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                {ref_item.year ?? ""}
                {ref_item.director ? ` · ${ref_item.director}` : ""}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-1">
                {[typeLabel, ref_item.genre?.[0]].filter(Boolean).join(" · ") || "·"}
              </p>
            </div>
            {ref_item.imdb_rating != null && (
              <div className="shrink-0 flex items-center gap-0.5 text-amber-500 text-sm font-semibold">
                <IconStar className="h-4 w-4 fill-amber-500" />
                {ref_item.imdb_rating.toFixed(1)}
              </div>
            )}
          </div>
          {ref_item.plot_snippet && (
            <p className="text-sm text-muted-foreground line-clamp-3 flex-1 leading-relaxed min-h-[3.5rem]">
              {ref_item.plot_snippet}
            </p>
          )}
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
            {typeLabel && <span className="font-medium">{typeLabel}</span>}
            <span className="text-border">•</span>
            <a
              href={getImsdbSearchUrl(ref_item.title)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:text-foreground transition-colors"
            >
              Script
            </a>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="h-full min-w-0"
    >
      <Card
        className="hover:shadow-xl transition-all cursor-pointer h-full flex flex-col group rounded-xl hover:border-primary/30 border border-border"
        onClick={onSelect}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center w-12 h-16">
                {ref_item.poster_url && !posterError ? (
                  <Image
                    src={ref_item.poster_url}
                    alt={ref_item.title}
                    width={48}
                    height={64}
                    className="object-cover w-full h-full"
                    unoptimized
                    onError={() => setPosterError(true)}
                  />
                ) : (
                  <IconPhoto className="h-5 w-5 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl leading-tight group-hover:text-primary transition-colors line-clamp-2">
                      {ref_item.title}
                    </h3>
                    {ref_item.is_best_match && (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary text-primary-foreground mt-1">
                        Best Match
                      </span>
                    )}
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                      {ref_item.year ?? ""}
                      {ref_item.director ? ` · ${ref_item.director}` : ""}
                    </p>
                  </div>
                  {ref_item.imdb_rating != null && (
                    <div className="shrink-0 flex items-center gap-0.5 text-amber-500">
                      <IconStar className="h-3.5 w-3.5 fill-amber-500" />
                      <span className="text-sm font-semibold">{ref_item.imdb_rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 min-w-0">
              {typeLabel && (
                <Badge variant="secondary" className="font-normal text-xs">
                  {typeLabel}
                </Badge>
              )}
              {genres.map((g) => (
                <Badge key={g} variant="outline" className="font-normal capitalize text-xs">
                  {g}
                </Badge>
              ))}
            </div>

            {actorList.length > 0 && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {actorList.join(" · ")}
              </p>
            )}

            {ref_item.plot_snippet && (
              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {ref_item.plot_snippet}
              </p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {ref_item.confidence_score != null && (() => {
                const score = ref_item.confidence_score;
                const pct = Math.round(score * 100);
                const badgeClass =
                  score >= 0.65
                    ? "bg-primary text-primary-foreground"
                    : score >= 0.5
                      ? "bg-secondary text-secondary-foreground"
                      : score >= 0.35
                        ? "bg-primary/25 text-primary border border-primary/40"
                        : "bg-muted text-muted-foreground";
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-medium rounded-full tabular-nums ${badgeClass}`}>
                    {pct}% match
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <a
                href={getImsdbSearchUrl(ref_item.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
              >
                <IconExternalLink className="h-3 w-3" />
                Script
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
