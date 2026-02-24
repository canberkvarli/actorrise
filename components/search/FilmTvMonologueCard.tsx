"use client";

import React from "react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { IconExternalLink, IconPlayerPlay } from "@tabler/icons-react";
import { motion } from "framer-motion";
import type { FilmTvMonologue } from "../../types/filmTv";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface FilmTvMonologueCardProps {
  mono: FilmTvMonologue;
  onSelect?: () => void;
  index?: number;
}

export function FilmTvMonologueCard({
  mono,
  onSelect,
  index = 0,
}: FilmTvMonologueCardProps) {
  const toneTags = mono.tone?.slice(0, 3) ?? [];
  const sourceTypeLabel = mono.source_type === "tv_series" ? "TV" : mono.source_type === "film" ? "Film" : null;
  const yearLabel = mono.source_year != null ? mono.source_year : "";

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
          <div className="space-y-4 flex-1">
            {/* Top: character + source (same hierarchy as plays) (character = title, play_title = source) */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xl mb-1 group-hover:text-foreground transition-colors">
                    {mono.character_name}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-[10px] font-normal bg-muted/80 text-muted-foreground"
                  >
                    Reference only
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {mono.source_title}
                  {yearLabel ? ` (${yearLabel})` : ""}
                </p>
                {mono.actor_name && (
                  <p className="text-xs text-muted-foreground">with {mono.actor_name}</p>
                )}
              </div>
            </div>

            {/* Badges row: same pattern as plays: category → gender → age → emotion */}
            <div className="flex flex-wrap gap-2">
              {sourceTypeLabel && (
                <Badge variant="secondary" className="font-normal capitalize">
                  {sourceTypeLabel}
                </Badge>
              )}
              {mono.character_gender && (
                <Badge variant="outline" className="font-normal capitalize">
                  {mono.character_gender}
                </Badge>
              )}
              {mono.character_age_range && (
                <Badge variant="outline" className="font-normal">
                  {mono.character_age_range}
                </Badge>
              )}
              {mono.primary_emotion && (
                <Badge variant="secondary" className="font-normal capitalize">
                  {mono.primary_emotion}
                </Badge>
              )}
              {mono.difficulty_level && (
                <Badge variant="outline" className="font-normal capitalize">
                  {mono.difficulty_level}
                </Badge>
              )}
            </div>

            {/* Scene description: same styled box as plays */}
            {mono.scene_description && (
              <div className="bg-secondary/10 px-3 py-2 rounded-md border-l-2 border-secondary/40">
                <p className="text-xs italic text-muted-foreground line-clamp-2">{mono.scene_description}</p>
              </div>
            )}

            {/* Tone/themes: same pills as plays themes */}
            {(toneTags.length > 0 || (mono.themes && mono.themes.length > 0)) && (
              <div className="flex flex-wrap gap-1.5">
                {toneTags.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2.5 py-1 bg-secondary/10 text-secondary-foreground/90 rounded-full font-medium capitalize"
                  >
                    {t}
                  </span>
                ))}
                {mono.themes?.slice(0, 2).map((theme) => (
                  <span
                    key={theme}
                    className="text-xs px-2.5 py-1 bg-secondary/10 text-secondary-foreground/90 rounded-full font-medium capitalize"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            )}

            {/* Description excerpt: analogous to play card's text excerpt (no script text) */}
            {mono.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                {mono.description}
              </p>
            )}
          </div>

          {/* Footer: same border-t layout as plays: duration + meta + actions */}
          <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {mono.estimated_duration_seconds != null && (
                <span className="font-medium">
                  ~{formatDuration(mono.estimated_duration_seconds)} min
                </span>
              )}
              {mono.word_count_approx != null && (
                <span>~{mono.word_count_approx} words</span>
              )}
            </div>
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {mono.script_url && (
                <a
                  href={mono.script_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
                >
                  <IconExternalLink className="h-3 w-3" />
                  Script
                </a>
              )}
              {mono.youtube_url && (
                <a
                  href={mono.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
                >
                  <IconPlayerPlay className="h-3 w-3" />
                  Watch
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
