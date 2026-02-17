"use client";

import Link from "next/link";
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
    <Card className="h-full flex flex-col rounded-xl border-border hover:border-primary/40 transition-colors">
      <CardContent className="p-6 sm:p-7 flex-1 flex flex-col">
        <div className="space-y-4 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-xl">{result.character_name}</h3>
            {result.relevance_score != null && result.relevance_score > 0.1 && (
              <span className="shrink-0 text-xs font-medium rounded-full bg-primary/15 text-primary px-2 py-0.5">
                {Math.round(result.relevance_score * 100)}% match
              </span>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            {result.play_title} · {result.author}
          </p>
          {result.scene_description && (
            <p className="text-sm text-foreground/85 line-clamp-2">{result.scene_description}</p>
          )}
          {result.text_excerpt && (
            <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4">
              {result.text_excerpt}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {formatDuration(result.estimated_duration_seconds)}
          </p>
        </div>
        <Button asChild size="default" className="mt-5 w-full rounded-full" variant="outline">
          <Link href={redirectUrl}>See more</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
