"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconBookmark, IconArrowRight } from "@tabler/icons-react";
import { Monologue } from "@/types/actor";
import { useBookmarkCount, useBookmarks } from "@/hooks/useBookmarks";

export default function BookmarksQuickAccess() {
  const { count, isLoading: isCountLoading } = useBookmarkCount();
  const { data: allBookmarks = [], isLoading } = useBookmarks();
  
  // Show first 3 bookmarks
  const recentBookmarks = allBookmarks.slice(0, 3);

  return (
    <Card>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : recentBookmarks.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <IconBookmark className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No bookmarks yet.</p>
            <p className="text-xs mt-1">Start exploring!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentBookmarks.map((mono) => (
              <Link
                key={mono.id}
                href={`/monologue/${mono.id}`}
                className="block p-2 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate group-hover:text-foreground transition-colors">
                      {mono.character_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {mono.play_title}
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {count > 3 && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-xs mt-2"
              >
                <Link href="/my-monologues">
                  View all {count}
                  <IconArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
