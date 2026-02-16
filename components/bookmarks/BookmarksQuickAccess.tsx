"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBookmark, IconArrowRight } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import { useBookmarkCount, useBookmarks } from "@/hooks/useBookmarks";

export interface BookmarksQuickAccessProps {
  /** When provided, clicking a bookmark opens the slide-over instead of navigating to full page */
  onSelectMonologue?: (mono: Monologue) => void;
}

const bookmarkRowBase =
  "flex items-center gap-3 w-full text-left p-4 rounded-lg border border-border/60 transition-all duration-200 group " +
  "hover:shadow-md hover:border-secondary/50 hover:bg-secondary/5 cursor-pointer";

export default function BookmarksQuickAccess({ onSelectMonologue }: BookmarksQuickAccessProps = {}) {
  const { count } = useBookmarkCount();
  const { data: allBookmarks = [], isLoading } = useBookmarks();

  const recentBookmarks = allBookmarks.slice(0, 3);

  return (
    <Card className="rounded-lg border-border/50">
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : recentBookmarks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <IconBookmark className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No bookmarks yet.</p>
            <p className="text-xs mt-1">Start exploring!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentBookmarks.map((mono) =>
              onSelectMonologue ? (
                <button
                  key={mono.id}
                  type="button"
                  onClick={() => onSelectMonologue(mono)}
                  className={bookmarkRowBase}
                >
                  <div className="p-2 rounded-full bg-violet-500/15 text-violet-500 dark:text-violet-400 flex-shrink-0" aria-hidden>
                    <IconBookmark className="h-4 w-4 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {mono.character_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {mono.play_title}
                    </div>
                  </div>
                  <IconArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ) : (
                <Link key={mono.id} href={`/monologue/${mono.id}`} className={bookmarkRowBase}>
                  <div className="p-2 rounded-full bg-violet-500/15 text-violet-500 dark:text-violet-400 flex-shrink-0" aria-hidden>
                    <IconBookmark className="h-4 w-4 fill-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                      {mono.character_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {mono.play_title}
                    </div>
                  </div>
                  <IconArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </Link>
              )
            )}

            {count > 3 && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-fit shrink-0 rounded-lg border-secondary/40 hover:bg-secondary/10 hover:border-secondary/50 hover:text-foreground text-foreground text-sm mt-1"
              >
                <Link href="/my-monologues" className="cursor-pointer text-inherit hover:text-inherit whitespace-nowrap">
                  View all {count}
                  <IconArrowRight className="h-3.5 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
