"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IconSparkles, IconExternalLink, IconInfoCircle, IconBookmark } from "@tabler/icons-react";
import Link from "next/link";
import { Monologue } from "@/types/actor";

export interface MonologueDetailContentProps {
  monologue: Monologue;
  /** When true, show an "Open in new page" link (for slide-over context) */
  showOpenInNewPage?: boolean;
  /** Optional actions to render in the header row (e.g. favorite button on full page) */
  headerActions?: React.ReactNode;
}

export function MonologueDetailContent({
  monologue,
  showOpenInNewPage,
  headerActions,
}: MonologueDetailContentProps) {
  const duration = Math.floor(monologue.estimated_duration_seconds / 60);
  const seconds = monologue.estimated_duration_seconds % 60;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold font-typewriter">{monologue.character_name}</h1>
            <p className="text-lg text-muted-foreground font-typewriter">
              From <span className="font-semibold">{monologue.play_title}</span> by {monologue.author}
            </p>
          </div>
          {headerActions}
        </div>

        {/* Scene Description */}
        {monologue.scene_description && (
          <div className="bg-muted/50 p-4 rounded-xl border border-border">
            <p className="text-sm italic text-muted-foreground flex items-start gap-2">
              <IconSparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
              {monologue.scene_description}
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground mr-1">Character:</span>
            <Badge variant="outline" className="font-normal font-typewriter rounded-lg">
              {monologue.character_name}
            </Badge>
            {monologue.character_gender && (
              <Badge variant="outline" className="font-normal capitalize rounded-lg">
                {monologue.character_gender}
              </Badge>
            )}
            {monologue.character_age_range && (
              <Badge variant="outline" className="font-normal rounded-lg">
                {monologue.character_age_range}
              </Badge>
            )}
          </div>
          {monologue.category && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground mr-1">Genre:</span>
              <Badge variant="secondary" className="font-normal capitalize rounded-lg">
                {monologue.category}
              </Badge>
            </div>
          )}
          {monologue.themes && monologue.themes.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground mr-1">Themes:</span>
              <div className="flex flex-wrap gap-1.5">
                {monologue.themes.map((theme) => (
                  <span
                    key={theme}
                    className="px-2.5 py-1 bg-muted/80 text-muted-foreground rounded-full text-xs font-medium capitalize"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* AI Analysis */}
      {(monologue.primary_emotion ||
        monologue.tone ||
        (monologue.emotion_scores && Object.keys(monologue.emotion_scores).length > 0)) && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              AI Analysis
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {monologue.primary_emotion && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Primary Emotion:</p>
                  <Badge
                    variant="outline"
                    className="font-normal capitalize border-primary/60 bg-primary/10 text-foreground"
                  >
                    {monologue.primary_emotion}
                  </Badge>
                </div>
              )}
              {monologue.tone && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tone:</p>
                  <Badge variant="outline" className="font-normal capitalize">
                    {monologue.tone}
                  </Badge>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Duration
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">Estimated from word count at ~150 words per minute.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </p>
                <Badge variant="outline" className="font-normal rounded-lg">
                  {duration}:{seconds.toString().padStart(2, "0")} min
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Word Count:</p>
                <Badge variant="outline" className="font-normal">
                  {monologue.word_count} words
                </Badge>
              </div>
            </div>

            {/* Emotion Scores */}
            {monologue.emotion_scores && Object.keys(monologue.emotion_scores).length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-2">Emotion Breakdown:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(monologue.emotion_scores)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([emotion, score]) => (
                      <div key={emotion} className="flex items-center gap-2 text-xs">
                        <span className="capitalize text-muted-foreground">{emotion}:</span>
                        <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${score * 100}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground">{Math.round(score * 100)}%</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          <Separator />
        </>
      )}

      {/* Monologue Text */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Monologue Text
        </h3>
        <div className="bg-muted/30 p-6 rounded-xl border border-border">
          <p className="text-base leading-relaxed whitespace-pre-wrap font-typewriter">
            {monologue.text}
          </p>
        </div>
      </div>

      {/* Footer Stats */}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex gap-6 items-center">
          <span>👁️ {monologue.view_count} views</span>
          <span className="flex items-center gap-1">
            <IconBookmark className="h-4 w-4" />
            {monologue.favorite_count} bookmarks
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconInfoCircle className="h-3.5 w-3.5 cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">Number of users who have bookmarked this monologue.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        </div>
        {monologue.overdone_score > 0.7 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600">
            ⚠️ Frequently performed
          </Badge>
        )}
      </div>

      {/* Open in new page (for slide-over) */}
      {showOpenInNewPage && (
        <div className="pt-2">
          <Button variant="outline" size="sm" asChild className="w-full sm:w-auto">
            <Link href={`/monologue/${monologue.id}`} target="_blank" rel="noopener noreferrer">
              Open in new page
              <IconExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>
      )}

      {/* Source Attribution */}
      <Card className="rounded-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h4 className="font-semibold mb-1">Source</h4>
              <p className="text-sm text-muted-foreground">
                {monologue.play_title} by {monologue.author}
              </p>
            </div>
            {monologue.source_url && (
              <Button variant="outline" asChild className="hover:border-primary hover:text-primary">
                <a
                  href={monologue.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  View Full Play
                  <IconExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
