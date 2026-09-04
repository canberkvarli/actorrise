"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PrefetchLink } from "@/components/ui/prefetch-link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBookmark, IconEdit, IconArrowRight } from "@tabler/icons-react";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import { motion } from "framer-motion";
import { Monologue } from "@/types/actor";
import { isMeaningfulMonologueTitle, displayableAuthor } from "@/lib/utils";
import { getGenreDotClassName } from "@/lib/genreColors";
import { MatchIndicatorTag, accentTeal } from "@/components/search/MatchIndicatorTag";
import type { QueryHighlights } from "@/lib/queryMatchHighlight";
import type { MatchReason } from "@/lib/matchReasons";

/** `rank` is the 0-based result index, so only index 0 is the best pick —
 *  `<= 1` claimed it for the first two, and two cards both read "Best pick". */
function getRankLabel(rank: number): string | null {
  if (rank === 0) return "Best pick";
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

  // Why-you-got-this, profile edition: the recommender's per-piece fit reason
  // ("Matches your preferred genre", "Right difficulty for your level") was
  // computed and passed in but never shown. Surface the first one so the profile
  // visibly pays off on the results themselves, not just the "For you" shelf.
  const profileReason =
    matchReasons?.find((r) => r.category === "profile")?.label ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
      className="relative overflow-visible"
    >
      {indicatorLabel && <MatchIndicatorTag label={indicatorLabel} />}
      <Card
        className={`relative overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col group rounded-lg ${
          size === "dashboard" ? "h-[500px]" : "h-full min-h-[380px]"
        } ${isBestMatch ? "border-border hover:border-muted-foreground/40" : "hover:border-secondary/50"}`}
        onClick={onSelect}
      >
        {/* Category spine — the same shelf-to-page colour cue ScenePartner uses */}
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1 opacity-70 ${getGenreDotClassName(mono.category)}`}
        />
        <CardContent className="p-6 pl-7 flex-1 flex flex-col">
          <div className="space-y-4 flex-1">
            <div className="flex items-start justify-between gap-2">
              {mono.poster_url && (
                <div className="shrink-0 w-20 h-30 sm:w-24 sm:h-36 rounded overflow-hidden bg-muted">
                  <Image
                    src={mono.poster_url}
                    alt={mono.play_title || "Poster"}
                    width={96}
                    height={144}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-typewriter font-semibold text-xl sm:text-2xl mb-1 group-hover:text-foreground transition-colors line-clamp-2 break-words">
                    {mono.character_name}
                  </h3>
                  {mono.is_favorited && (
                    <span className={`px-2 py-0.5 border text-xs font-medium ${accentTeal.bg} ${accentTeal.text} border-transparent`}>
                      In collection
                    </span>
                  )}
                </div>
                {isMeaningfulMonologueTitle(mono.title, mono.character_name, mono.play_title) && (
                  <p className="text-sm font-medium text-foreground/90 line-clamp-1">{mono.title}</p>
                )}
                <p className="font-typewriter text-sm text-muted-foreground line-clamp-1">
                  {mono.play_title}
                  {displayableAuthor(mono.author) ? ` · ${displayableAuthor(mono.author)}` : ""}
                </p>
                {profileReason && (
                  <span className="mt-1.5 inline-block border border-primary/30 bg-primary/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    {profileReason}
                  </span>
                )}
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
                aria-label={mono.is_favorited ? "Remove from collection" : "Add to collection"}
                title={mono.is_favorited ? "In collection" : "Add to collection"}
                >
                  <BookmarkIcon filled={!!mono.is_favorited} size="md" />
                </motion.button>
              </div>
            </div>

            {/* What the actor decides on, before the words: how long is it, and
                is everyone else already bringing it. Length used to sit in the
                footer under eight lines of excerpt. */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs">
              <span className="font-medium text-foreground tabular-nums">
                {Math.floor(mono.estimated_duration_seconds / 60)}:
                {(mono.estimated_duration_seconds % 60).toString().padStart(2, "0")}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground tabular-nums">{mono.word_count} words</span>
              {/* Only 151 of 14.4k pieces score above 0.7, so this stays rare */}
              {mono.overdone_score > 0.7 && (
                <span className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  everyone brings this
                </span>
              )}
            </div>

            {/* One quiet line: gender · age · category · emotion */}
            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs text-muted-foreground min-h-[20px]">
              {mono.character_gender && mono.character_gender.toLowerCase() !== "any" && (
                <span className="capitalize">{mono.character_gender}</span>
              )}
              {mono.character_age_range && mono.character_age_range.toLowerCase() !== "any" && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span>{mono.character_age_range}</span>
                </>
              )}
              {mono.category && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span
                    className={`font-medium capitalize ${
                      mono.category.toLowerCase() === "classical"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-teal-600 dark:text-teal-400"
                    }`}
                  >
                    {mono.category}
                  </span>
                </>
              )}
              {mono.primary_emotion && mono.primary_emotion.toLowerCase() !== "unknown" && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="capitalize">{mono.primary_emotion}</span>
                </>
              )}
            </div>

            {/* The piece — the focus. It's the monologue text, so: typewriter. */}
            {/* A taste, not the whole speech — eight lines of it pushed the
                length, the label and the action off the bottom of the card. */}
            <p
              className={`font-typewriter text-[15px] leading-relaxed text-foreground/80 ${
                size === "dashboard" ? "line-clamp-[6]" : "line-clamp-4"
              }`}
            >
              &ldquo;{mono.text.substring(0, size === "dashboard" ? 400 : 280)}…&rdquo;
            </p>
          </div>

          {/* One clear action: rehearse the piece. Memorize/self-tape live on the
              detail view + Collection, so the card stays a single obvious step. */}
          <div className="mt-4 pt-4 border-t flex items-center gap-3">
            <PrefetchLink
              href={`/monologue/${mono.id}/work`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Rehearse
              <IconArrowRight className="h-3.5 w-3.5" />
            </PrefetchLink>
            {mono.favorite_count > 0 && (
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <IconBookmark className="h-3 w-3" />
                {mono.favorite_count}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
