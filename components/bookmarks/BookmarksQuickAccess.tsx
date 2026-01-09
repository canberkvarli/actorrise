"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconBookmark, IconArrowRight } from "@tabler/icons-react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { useBookmarkCount } from "@/hooks/useBookmarkCount";

export default function BookmarksQuickAccess() {
  const { count, isLoading: isCountLoading } = useBookmarkCount();
  const [recentBookmarks, setRecentBookmarks] = useState<Monologue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRecentBookmarks();
  }, []);

  const fetchRecentBookmarks = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Monologue[]>("/api/monologues/favorites/my");
      // Show first 3 bookmarks
      setRecentBookmarks(response.data.slice(0, 3));
    } catch (error) {
      console.error("Error fetching bookmarks:", error);
      setRecentBookmarks([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBookmark className="h-5 w-5 text-accent" />
            Your Monologues
          </div>
          {!isCountLoading && count > 0 && (
            <Badge variant="secondary">{count}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
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
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Recent bookmarks:</div>
            <div className="space-y-2">
              {recentBookmarks.map((mono) => (
                <Link
                  key={mono.id}
                  href={`/monologue/${mono.id}`}
                  className="block p-2 rounded hover:bg-muted transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {mono.character_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {mono.play_title}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 flex-shrink-0">
                      {mono.category}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full gap-2 mt-2"
            >
              <Link href="/my-monologues">
                View All Bookmarks
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
