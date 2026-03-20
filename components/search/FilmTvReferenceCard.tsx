"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconStar, IconPhoto } from "@tabler/icons-react";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { motion } from "framer-motion";
import Image from "next/image";
import type { FilmTvReference } from "@/types/filmTv";
import { MatchIndicatorTag } from "@/components/search/MatchIndicatorTag";
import { ScriptSourcePicker } from "@/components/search/ScriptSourcePicker";

export interface FilmTvReferenceCardProps {
  ref_item: FilmTvReference;
  onSelect?: () => void;
  index?: number;
  /** Compact = same size/style as monologue cards (one line, no new lines) */
  compact?: boolean;
  /** When set, show bookmark button and call on toggle (e.g. from search). */
  isFavorited?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}

export function FilmTvReferenceCard({
  ref_item,
  onSelect,
  index = 0,
  compact = false,
  isFavorited = false,
  onToggleFavorite,
}: FilmTvReferenceCardProps) {
  const [posterError, setPosterError] = useState(false);
  const typeLabel = ref_item.type === "tvSeries" ? "TV Series" : ref_item.type === "movie" ? "Movie" : null;
  const genres = ref_item.genre?.slice(0, 3) ?? [];
  const actorList = ref_item.actors?.slice(0, 3) ?? [];

  const cardEase = [0.25, 0.1, 0.25, 1] as const;
  const indicatorAbove =
    ref_item.is_best_match
      ? "Best match"
      : ref_item.confidence_score != null
        ? `${Math.round(ref_item.confidence_score * 100)}% match`
        : null;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: cardEase }}
        className="relative overflow-visible h-full"
      >
        {indicatorAbove && <MatchIndicatorTag label={indicatorAbove} />}
        <div
          className="w-full group p-4 sm:p-6 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full flex flex-col min-h-[280px] sm:min-h-[320px]"
          onClick={onSelect}
        >
          <div className="flex items-start gap-2 sm:gap-3 mb-4">
            <div className="shrink-0 w-12 h-18 sm:w-16 sm:h-24 rounded overflow-hidden bg-muted flex items-center justify-center">
              {ref_item.poster_url && !posterError ? (
                <Image
                  src={ref_item.poster_url}
                  alt={ref_item.title}
                  width={64}
                  height={96}
                  className="object-cover w-full h-full"
                  unoptimized
                  onError={() => setPosterError(true)}
                />
              ) : (
                <IconPhoto className="h-6 w-6 text-muted-foreground/50" />
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors break-words min-w-0 flex-1 line-clamp-2">
                  {ref_item.title}
                </h3>
                <div className="shrink-0 flex items-center gap-1.5 min-w-[4.5rem] justify-end">
                  {onToggleFavorite != null && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(e);
                      }}
                      className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-200 ease-out"
                      aria-label={isFavorited ? "Remove from saved" : "Add to saved"}
                    >
                      <BookmarkIcon filled={isFavorited} size="sm" className={isFavorited ? "text-foreground" : ""} />
                    </button>
                  )}
                  {ref_item.imdb_rating != null && (
                    <div className="flex items-center gap-0.5 text-amber-500 text-sm font-semibold">
                      <IconStar className="h-4 w-4 fill-amber-500 shrink-0" />
                      <span className="tabular-nums">{ref_item.imdb_rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2 break-words w-full">
                {ref_item.year ?? ""}
                {ref_item.director ? ` · Directed by ${ref_item.director}` : ""}
              </p>
              <p className="text-xs text-muted-foreground/70 line-clamp-2">
                {[typeLabel, ref_item.genre?.[0]].filter(Boolean).join(" · ") || "·"}
              </p>
            </div>
          </div>
          {ref_item.plot_snippet && (
            <p className="text-sm text-muted-foreground line-clamp-3 flex-1 leading-relaxed min-h-[4rem]">
              {ref_item.plot_snippet}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/50 text-xs">
            {typeLabel && <span className="font-medium text-muted-foreground">{typeLabel}</span>}
            <ScriptSourcePicker ref_item={ref_item} compact />
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
      className="relative overflow-visible h-full min-w-0"
    >
      {indicatorAbove && <MatchIndicatorTag label={indicatorAbove} />}
      <Card
        className="w-full hover:shadow-xl transition-all cursor-pointer h-full flex flex-col group rounded-xl hover:border-primary/30 border border-border"
        onClick={onSelect}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            <div className="flex items-start gap-2 sm:gap-3 min-w-0">
              <div className="shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center w-14 h-20 sm:w-20 sm:h-28">
                {ref_item.poster_url && !posterError ? (
                  <Image
                    src={ref_item.poster_url}
                    alt={ref_item.title}
                    width={80}
                    height={112}
                    className="object-cover w-full h-full"
                    unoptimized
                    onError={() => setPosterError(true)}
                  />
                ) : (
                  <IconPhoto className="h-6 w-6 text-muted-foreground/50" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-base sm:text-lg lg:text-xl leading-tight group-hover:text-primary transition-colors break-words min-w-0 flex-1 line-clamp-2">
                    {ref_item.title}
                  </h3>
                  <div className="shrink-0 flex items-center gap-1.5 min-w-[4.5rem] justify-end">
                    {onToggleFavorite != null && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(e);
                        }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors duration-200 ease-out"
                        aria-label={isFavorited ? "Remove from saved" : "Add to saved"}
                      >
                        <BookmarkIcon filled={isFavorited} size="md" className={isFavorited ? "text-foreground" : ""} />
                      </button>
                    )}
                    {ref_item.imdb_rating != null && (
                      <div className="flex items-center gap-0.5 text-amber-500">
                        <IconStar className="h-3.5 w-3.5 fill-amber-500 shrink-0" />
                        <span className="text-sm font-semibold tabular-nums">{ref_item.imdb_rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 break-words w-full">
                  {ref_item.year ?? ""}
                  {ref_item.director ? ` · Directed by ${ref_item.director}` : ""}
                </p>
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

          <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2 text-xs">
            <ScriptSourcePicker ref_item={ref_item} />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
