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
}

export function FilmTvReferenceCard({
  ref_item,
  onSelect,
  index = 0,
}: FilmTvReferenceCardProps) {
  const [posterError, setPosterError] = useState(false);
  const typeLabel = ref_item.type === "tvSeries" ? "TV Series" : ref_item.type === "movie" ? "Movie" : null;
  const genres = ref_item.genre?.slice(0, 3) ?? [];
  const actorList = ref_item.actors?.slice(0, 3) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
    >
      <Card
        className="hover:shadow-xl transition-all cursor-pointer h-full flex flex-col group rounded-lg hover:border-secondary/50"
        onClick={onSelect}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">

            {/* Top row: poster thumbnail + title/meta */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-12 h-16 rounded overflow-hidden bg-muted flex items-center justify-center">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-xl leading-tight group-hover:text-foreground transition-colors">
                        {ref_item.title}
                      </h3>
                      {ref_item.is_best_match && (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                          Best Match
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {ref_item.year ?? ""}
                      {ref_item.director ? ` · ${ref_item.director}` : ""}
                    </p>
                  </div>
                  {ref_item.imdb_rating != null && (
                    <div className="shrink-0 flex items-center gap-1 text-sm font-semibold text-amber-500">
                      <IconStar className="h-3.5 w-3.5 fill-amber-500" />
                      {ref_item.imdb_rating.toFixed(1)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Type + genre badges */}
            <div className="flex flex-wrap gap-1.5">
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

            {/* Actors */}
            {actorList.length > 0 && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {actorList.join(" · ")}
              </p>
            )}

            {/* Plot snippet */}
            {ref_item.plot_snippet && (
              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                {ref_item.plot_snippet}
              </p>
            )}
          </div>

          {/* Footer */}
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
              {(() => {
                const scriptHref = getImsdbSearchUrl(ref_item.title);
                return (
                  <a
                    href={scriptHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
                  >
                    <IconExternalLink className="h-3 w-3" />
                    Script
                  </a>
                );
              })()}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
