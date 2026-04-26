"use client";

import { useState } from "react";
import Image from "next/image";
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
import type { QueryHighlights } from "@/lib/queryMatchHighlight";
import type { MatchReason } from "@/lib/matchReasons";
import { MatchReasonTooltip } from "@/components/search/MatchReasonTooltip";

function getRankLabel(rank: number): string | null {
  if (rank <= 1) return "Best pick";
  if (rank <= 4) return "Great match";
  if (rank <= 9) return "Good match";
  return null;
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
  /** Highlights extracted from the search query — matching badges get a visual ring. */
  highlightFields?: QueryHighlights;
  /** Match reasons for the "why you got this" tooltip. */
  matchReasons?: MatchReason[];
  /** Layout variant. "dashboard" is a taller fixed-height tile with more synopsis lines. */
  size?: "default" | "dashboard";
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
  highlightFields,
  matchReasons,
  size = "default",
}: MonologueResultCardProps) {
  const isBestMatch = variant === "bestMatch";
  const [justBookmarked, setJustBookmarked] = useState(false);

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
              : getRankLabel(index);
  const showIndicator = showMatchBadge && matchLabel;
  const indicatorLabel = showIndicator ? matchLabel : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="relative overflow-visible"
    >
      {indicatorLabel && <MatchIndicatorTag label={indicatorLabel} />}
      <Card
        className={`hover:shadow-xl transition-all cursor-pointer flex flex-col group rounded-lg ${
          size === "dashboard" ? "h-[380px]" : "h-full min-h-[360px]"
        } ${
          isBestMatch ? "border-l-4 border-border hover:border-muted-foreground/40" : "hover:border-secondary/50"
        }`}
        onClick={onSelect}
      >
        <CardContent className="pt-6 flex-1 flex flex-col">
          <div className="space-y-4 flex-1">
            <div className="flex items-start justify-between gap-2">
              {mono.poster_url && (
                <div className="shrink-0 w-14 h-20 rounded overflow-hidden bg-muted">
                  <Image
                    src={mono.poster_url}
                    alt={mono.play_title || "Poster"}
                    width={56}
                    height={80}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg sm:text-xl lg:text-2xl mb-1 group-hover:text-foreground transition-colors line-clamp-2 break-words">
                    {mono.character_name}
                  </h3>
                  {mono.is_favorited && (
                    <span className="px-2 py-0.5 bg-muted/90 text-foreground border border-border text-xs font-medium rounded-md">
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

            {/* Metadata row: gender · age · category */}
            <div className="flex items-center gap-1.5 flex-wrap min-h-[24px]">
              {mono.character_gender && mono.character_gender.toLowerCase() !== "any" && (
                <span className="text-[11px] text-muted-foreground capitalize">{mono.character_gender}</span>
              )}
              {mono.character_age_range && mono.character_age_range.toLowerCase() !== "any" && (
                <>
                  {mono.character_gender && mono.character_gender.toLowerCase() !== "any" && (
                    <span className="text-muted-foreground/40">·</span>
                  )}
                  <span className="text-[11px] text-muted-foreground">{mono.character_age_range}</span>
                </>
              )}
              {mono.category && (
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1.5 py-0 h-5 font-medium capitalize ${
                    mono.category.toLowerCase() === 'classical'
                      ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30'
                      : 'border-sky-500/50 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30'
                  }`}
                >
                  {mono.category}
                </Badge>
              )}
            </div>
            {/* Emotion on its own line */}
            {mono.primary_emotion && mono.primary_emotion.toLowerCase() !== "unknown" && (
              <Badge variant="secondary" className={`w-fit font-medium capitalize text-[11px] px-2 py-0.5 ${getEmotionBadgeClassName(mono.primary_emotion)}`}>
                {mono.primary_emotion}
              </Badge>
            )}

            <p className={`text-sm text-muted-foreground leading-relaxed ${size === "dashboard" ? "line-clamp-4" : "line-clamp-3"}`}>
              &ldquo;{mono.text.substring(0, size === "dashboard" ? 280 : 200)}...&rdquo;
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
          {matchReasons && matchReasons.length > 0 && (
            <div className="mt-2">
              <MatchReasonTooltip reasons={matchReasons} />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
