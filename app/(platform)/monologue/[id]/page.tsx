"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { IconBookmark, IconArrowLeft, IconSparkles, IconExternalLink } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import api from "@/lib/api";
import { motion } from "framer-motion";

export default function MonologueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [monologue, setMonologue] = useState<Monologue | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchMonologue(params.id as string);
    }
  }, [params.id]);

  const fetchMonologue = async (id: string) => {
    try {
      const response = await api.get(`/api/monologues/${id}`);
      setMonologue(response.data);
      setIsFavorited(response.data.is_favorited);
    } catch (error) {
      console.error("Error fetching monologue:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFavorite = async () => {
    if (!monologue) return;

    try {
      if (isFavorited) {
        await api.delete(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(false);
      } else {
        await api.post(`/api/monologues/${monologue.id}/favorite`);
        setIsFavorited(true);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Skeleton className="h-8 w-32 mb-8" />
        <Card>
          <CardContent className="pt-6 space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!monologue) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Monologue not found</h3>
            <Button onClick={() => router.push("/search")} className="mt-4">
              Back to Search
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const duration = Math.floor(monologue.estimated_duration_seconds / 60);
  const seconds = monologue.estimated_duration_seconds % 60;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4 hover:text-primary"
        >
          <IconArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Main Card */}
        <Card>
          <CardContent className="pt-8 space-y-6">
            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold mb-2 font-typewriter">{monologue.character_name}</h1>
                  <p className="text-lg text-muted-foreground font-typewriter">
                    From <span className="font-semibold">{monologue.play_title}</span> by {monologue.author}
                  </p>
                </div>
                <Button
                  variant={isFavorited ? "default" : "outline"}
                  size="icon"
                  onClick={toggleFavorite}
                  className={`ml-4 ${isFavorited ? 'bg-accent text-accent-foreground hover:bg-accent/90' : 'hover:text-accent'}`}
                >
                  <IconBookmark className={`h-5 w-5 ${isFavorited ? 'fill-current' : ''}`} />
                </Button>
              </div>

              {/* Scene Description */}
              {monologue.scene_description && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="bg-muted/50 p-4 rounded-lg border border-border"
                >
                  <p className="text-sm italic text-muted-foreground flex items-start gap-2">
                    <IconSparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                    {monologue.scene_description}
                  </p>
                </motion.div>
              )}
            </div>

            <Separator />

            {/* Details - Backstage.com Style */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Details
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Character:</p>
                  <Badge variant="outline" className="font-normal font-typewriter">
                    {monologue.character_name}
                  </Badge>
                </div>

                {monologue.category && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Genre:</p>
                    <Badge variant="outline" className="font-normal capitalize">
                      {monologue.category}
                    </Badge>
                  </div>
                )}

                {monologue.character_gender && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Gender:</p>
                    <Badge variant="outline" className="font-normal capitalize">
                      {monologue.character_gender}
                    </Badge>
                  </div>
                )}

                {monologue.character_age_range && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Age Range:</p>
                    <Badge variant="outline" className="font-normal">
                      {monologue.character_age_range}
                    </Badge>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Category:</p>
                  <Badge variant="outline" className="font-normal capitalize">
                    {monologue.category}
                  </Badge>
                </div>

                {monologue.themes && monologue.themes.length > 0 && (
                  <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-muted-foreground mb-2">Themes:</p>
                    <div className="flex flex-wrap gap-2">
                      {monologue.themes.map((theme) => (
                        <Badge key={theme} variant="secondary" className="font-normal capitalize">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* AI Analysis */}
            {monologue.primary_emotion && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  AI Analysis
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Primary Emotion:</p>
                    <Badge className="font-normal capitalize">
                      {monologue.primary_emotion}
                    </Badge>
                  </div>

                  {monologue.tone && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Tone:</p>
                      <Badge variant="outline" className="font-normal capitalize">
                        {monologue.tone}
                      </Badge>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Duration:</p>
                    <Badge variant="outline" className="font-normal">
                      {duration}:{seconds.toString().padStart(2, '0')} min
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
            )}

            <Separator />

            {/* Monologue Text */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Monologue Text
              </h3>
              <div className="bg-muted/30 p-6 rounded-lg border border-border">
                <p className="text-base leading-relaxed whitespace-pre-wrap font-typewriter">
                  {monologue.text}
                </p>
              </div>

              {monologue.stage_directions && (
                <div className="bg-muted/50 p-4 rounded-lg border border-border">
                  <p className="text-sm italic text-muted-foreground font-typewriter">
                    <span className="font-semibold not-italic">Stage Directions: </span>
                    {monologue.stage_directions}
                  </p>
                </div>
              )}
            </div>

            {/* Footer Stats */}
            <Separator />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex gap-6 items-center">
                <span>👁️ {monologue.view_count} views</span>
                <span className="flex items-center gap-1">
                  <IconBookmark className="h-4 w-4" />
                  {monologue.favorite_count} bookmarks
                </span>
              </div>
              {monologue.overdone_score > 0.7 && (
                <Badge variant="outline" className="text-amber-600 border-amber-600">
                  ⚠️ Frequently performed
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Source Attribution */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
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
      </motion.div>
    </div>
  );
}
