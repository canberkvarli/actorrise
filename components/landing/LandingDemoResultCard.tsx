"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface DemoSearchResultItem {
  id: number;
  character_name: string;
  play_title: string;
  author: string;
  scene_description?: string | null;
  estimated_duration_seconds: number;
  relevance_score?: number | null;
  match_type?: string | null;
  text_excerpt?: string | null;
}

interface LandingDemoResultCardProps {
  result: DemoSearchResultItem;
  signupRedirectQuery: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LandingDemoResultCard({ result, signupRedirectQuery }: LandingDemoResultCardProps) {
  const redirectUrl = `/signup?redirect=${encodeURIComponent(`/search?q=${encodeURIComponent(signupRedirectQuery)}`)}`;

  return (
    <motion.div
      className="h-full"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card className="h-full flex flex-col rounded-lg border-border hover:border-primary/40 hover:shadow-xl transition-all duration-300">
      <CardContent className="pt-6 flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h3 className="font-bold text-xl mb-1">{result.character_name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-1">{result.play_title}</p>
              <p className="text-xs text-muted-foreground">by {result.author}</p>
            </div>
            {result.relevance_score != null && result.relevance_score > 0.1 && (
              <span className="shrink-0 text-xs font-medium rounded-full bg-primary/15 text-primary px-2 py-0.5">
                {Math.round(result.relevance_score * 100)}% match
              </span>
            )}
          </div>

          {result.scene_description && (
            <div className="bg-secondary/10 px-3 py-2 rounded-md border-l-2 border-secondary/40">
              <p className="text-xs italic text-muted-foreground line-clamp-2">{result.scene_description}</p>
            </div>
          )}

          {result.text_excerpt && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              &ldquo;{result.text_excerpt}&rdquo;
            </p>
          )}

          <div className="pt-4 border-t flex items-center text-xs text-muted-foreground">
            <span className="font-medium">{formatDuration(result.estimated_duration_seconds)}</span>
          </div>
        </div>
        <Button asChild size="default" className="mt-4 w-full rounded-full" variant="outline">
          <Link href={redirectUrl}>See more</Link>
        </Button>
      </CardContent>
    </Card>
    </motion.div>
  );
}
