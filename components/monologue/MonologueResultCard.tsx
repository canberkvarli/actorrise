"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBookmark, IconEdit } from "@tabler/icons-react";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { motion } from "framer-motion";
import { Monologue } from "@/types/actor";
import { isMeaningfulMonologueTitle } from "@/lib/utils";
import { MatchIndicatorTag, accentTeal } from "@/components/search/MatchIndicatorTag";
import { getEmotionBadgeClassName } from "@/lib/emotionColors";

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
  /** When true and onEdit is provided, show an Edit button (moderator only). */
  isModerator?: boolean;
  onEdit?: (id: number) => void;
}

export function MonologueResultCard({
  mono,
  onSelect,
  onToggleFavorite,
  variant = "default",
  index = 0,
  showMatchBadge = true,
  isModerator = false,
  onEdit,
}: MonologueResultCardProps) {
  const isBestMatch = variant === "bestMatch";
  const [justBookmarked, setJustBookmarked] = useState(false);

  const score = mono.relevance_score ?? 0;
  const hasScore = showMatchBadge && score > 0.1;
  const pct = Math.round(score * 100);
  const matchLabel =
    mono.match_type === "exact_quote"
      ? "Exact quote"
      : mono.match_type === "fuzzy_quote"
        ? "This is the one"
        : mono.match_type === "title_match"
          ? "Exact match"
          : mono.match_type === "character_match"
            ? "Character match"
            : mono.match_type === "play_match"
              ? "Play match"
              : getMatchLabel(score);
  const showIndicator = (hasScore || mono.match_type) && matchLabel;
  const indicatorLabel = showIndicator ? `${matchLabel}${pct > 0 ? ` · ${pct}%` : ""}` : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="relative overflow-visible"
    >
      {indicatorLabel && <MatchIndicatorTag label={indicatorLabel} />}
      <Card
        className={`hover:shadow-xl transition-all cursor-pointer h-full flex flex-col group rounded-lg ${
          isBestMatch ? "border-l-4 border-border hover:border-muted-foreground/40" : "hover:border-secondary/50"
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
                  {mono.is_favorited && (
                    <span className="px-2 py-0.5 bg-muted/90 text-foreground border border-border text-xs font-semibold rounded-full">
                      Saved
                    </span>
                  )}
                </div>
                {isMeaningfulMonologueTitle(mono.title, mono.character_name) && (
                  <p className="text-sm font-medium text-foreground/90 line-clamp-1">{mono.title}</p>
                )}
                <p className="text-sm text-muted-foreground line-clamp-1">{mono.play_title}</p>
                <p className="text-xs text-muted-foreground">by {mono.author}</p>
              </div>
              <div className="flex items-center gap-1">
                {isModerator && onEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(mono.id);
                    }}
                    aria-label="Edit monologue"
                  >
                    <IconEdit className="h-4 w-4" />
                  </Button>
                )}
                <motion.button
                  type="button"
                  onClick={(e) => {
                    onToggleFavorite(e, mono);
                    setJustBookmarked(true);
                    setTimeout(() => setJustBookmarked(false), 400);
                  }}
                animate={justBookmarked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-lg transition-colors duration-200 ease-out cursor-pointer ${
                  mono.is_favorited
                    ? `${accentTeal.bg} ${accentTeal.bgHover} ${accentTeal.text}`
                    : `${accentTeal.hoverBg} ${accentTeal.textHover} text-muted-foreground`
                }`}
                aria-label={mono.is_favorited ? "Remove bookmark" : "Add bookmark"}
                >
                  <BookmarkIcon filled={!!mono.is_favorited} size="md" />
                </motion.button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {mono.category && (
                <Badge
                  variant="secondary"
                  className={`font-normal capitalize ${
                    mono.category.toLowerCase() === "classical"
                      ? "bg-amber-500/10 text-amber-700 border-amber-300/40 dark:text-amber-400 dark:border-amber-500/30"
                      : mono.category.toLowerCase() === "contemporary"
                      ? "bg-teal-500/10 text-teal-700 border-teal-300/40 dark:text-teal-400 dark:border-teal-500/30"
                      : ""
                  }`}
                >
                  {mono.category}
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
                <Badge variant="secondary" className={`font-normal capitalize ${getEmotionBadgeClassName(mono.primary_emotion)}`}>
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
