"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconBookmark } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { Monologue } from "@/types/actor";

function getScoreBadgeClass(score: number, isBestMatch: boolean) {
  if (isBestMatch || score >= 0.65) return "bg-primary/15 text-primary";
  if (score >= 0.5) return "bg-secondary/20 text-secondary-foreground";
  if (score >= 0.35) return "bg-primary/10 text-primary/90";
  return "bg-muted/80 text-muted-foreground";
}

function getMatchLabel(score: number): string {
  if (score >= 0.65) return "Great match";
  if (score >= 0.5) return "Good match";
  if (score >= 0.35) return "Worth a look";
  return "Related";
}

export interface MonologueResultCardProps {
  mono: Monologue;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent, mono: Monologue) => void;
  variant?: "default" | "bestMatch";
  index?: number;
  showMatchBadge?: boolean;
}

export function MonologueResultCard({
  mono,
  onSelect,
  onToggleFavorite,
  variant = "default",
  index = 0,
  showMatchBadge = true,
}: MonologueResultCardProps) {
  const isBestMatch = variant === "bestMatch";
  const displayMatchBadge = (m: Monologue) => {
    if (!showMatchBadge || !m.relevance_score || m.relevance_score <= 0.1) return null;
    const score = m.relevance_score;
    const pct = Math.round(score * 100);
    const label =
      m.match_type === "exact_quote"
        ? "Exact quote"
        : m.match_type === "fuzzy_quote"
          ? "This is the one"
          : getMatchLabel(score);
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getScoreBadgeClass(
          score,
          isBestMatch
        )}`}
      >
        {label} · {pct}%
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
    >
      <Card
        className={`hover:shadow-xl transition-all cursor-pointer h-full flex flex-col group rounded-lg ${
          isBestMatch ? "border-l-4 border-primary hover:border-primary/70" : "hover:border-secondary/50"
        }`}
        onClick={onSelect}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          <div className="space-y-4 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xl mb-1 group-hover:text-foreground transition-colors">
                    {mono.character_name}
                  </h3>
                  {displayMatchBadge(mono)}
                  {mono.is_favorited && (
                    <span className="px-2 py-0.5 bg-accent/20 text-accent-foreground text-xs font-semibold rounded-full">
                      Bookmarked
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">{mono.play_title}</p>
                <p className="text-xs text-muted-foreground">by {mono.author}</p>
              </div>
              <button
                type="button"
                onClick={(e) => onToggleFavorite(e, mono)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  mono.is_favorited
                    ? "bg-violet-500/15 hover:bg-violet-500/25 text-violet-500 dark:text-violet-400"
                    : "hover:bg-violet-500/15 hover:text-violet-500 text-muted-foreground"
                }`}
                aria-label={mono.is_favorited ? "Remove bookmark" : "Add bookmark"}
              >
                <IconBookmark className={`h-5 w-5 ${mono.is_favorited ? "fill-current" : ""}`} />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="font-normal capitalize">
                {mono.category}
              </Badge>
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
            </div>

            {mono.scene_description && (
              <div className="bg-secondary/10 px-3 py-2 rounded-md border-l-2 border-secondary/40">
                <p className="text-xs italic text-muted-foreground line-clamp-2">{mono.scene_description}</p>
              </div>
            )}

            {mono.themes && mono.themes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mono.themes.slice(0, 3).map((theme) => (
                  <span
                    key={theme}
                    className="text-xs px-2.5 py-1 bg-secondary/10 text-secondary-foreground/90 rounded-full font-medium capitalize"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              &ldquo;{mono.text.substring(0, 120)}...&rdquo;
            </p>
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">
              {Math.floor(mono.estimated_duration_seconds / 60)}:
              {(mono.estimated_duration_seconds % 60).toString().padStart(2, "0")} min
            </span>
            <span>{mono.word_count} words</span>
            <span className="flex items-center gap-1">
              <IconBookmark className="h-3 w-3" />
              {mono.favorite_count}
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
