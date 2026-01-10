"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconSearch, IconClock, IconX, IconArrowRight } from "@tabler/icons-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  getSearchHistory,
  formatRelativeTime,
  truncateQuery,
  removeSearchFromHistory,
  restoreSearchToHistory,
  SearchHistoryEntry,
} from "@/lib/searchHistory";
import MiniMonologueCard from "./MiniMonologueCard";

interface RecentSearchesProps {
  maxSearches?: number;
  compact?: boolean;
}

export default function RecentSearches({ maxSearches = 3, compact = false }: RecentSearchesProps) {
  const router = useRouter();
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const allHistory = getSearchHistory();
    setHistory(allHistory.slice(0, maxSearches));
  };

  const handleSearchClick = (entry: SearchHistoryEntry) => {
    router.push(`/search?id=${entry.id}`);
  };

  const handleRemove = (e: React.MouseEvent, entry: SearchHistoryEntry) => {
    e.stopPropagation(); // Prevent triggering the card click
    
    // Store the entry for potential restore
    const entryToRestore = { ...entry };
    
    // Remove from history
    removeSearchFromHistory(entry.id);
    loadHistory(); // Reload the history to reflect the change
    
    // Show toast with undo option
    toast("Search removed", {
      description: entry.query ? `"${truncateQuery(entry.query, 30)}"` : "Browse all",
      duration: 5000, // 5 seconds
      action: {
        label: "Undo",
        onClick: () => {
          restoreSearchToHistory(entryToRestore);
          loadHistory();
          toast.success("Search restored");
        },
      },
    });
  };

  if (history.length === 0) {
    if (compact) {
      return (
        <div className="text-center py-6 text-muted-foreground">
          <IconSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No recent searches</p>
        </div>
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconClock className="h-5 w-5" />
            Recent Searches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <IconSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No recent searches yet.</p>
            <p className="text-xs mt-1">Try searching for monologues!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    if (history.length === 0) {
      return (
        <div className="text-center py-6 text-muted-foreground">
          <IconSearch className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">No recent searches</p>
        </div>
      );
    }
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {history.map((entry) => (
              <div
                key={entry.id}
                onClick={() => handleSearchClick(entry)}
                className="p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {entry.query || "Browse all"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelativeTime(entry.timestamp)}
                    </p>
                  </div>
                  <IconArrowRight className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </div>
            ))}
            {history.length >= maxSearches && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/search")}
                className="w-full text-xs mt-2"
              >
                View all searches
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconClock className="h-5 w-5" />
          Recent Searches
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          {history.map((entry, index) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div
                onClick={() => handleSearchClick(entry)}
                className="border border-border rounded-lg p-3 hover:bg-muted/50 cursor-pointer transition-all hover:shadow-md space-y-3 relative"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleRemove(e, entry)}
                  className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors z-10"
                  aria-label="Remove search"
                >
                  <IconX className="h-4 w-4" />
                </button>

                {/* Query and filters */}
                <div className="space-y-2 pr-6">
                  <div className="font-medium text-sm truncate" title={entry.query}>
                    {entry.query ? `"${truncateQuery(entry.query, 40)}"` : "Browse all"}
                  </div>

                  {/* Filter badges */}
                  {Object.entries(entry.filters).some(([_, value]) => value) && (
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(entry.filters).map(
                        ([key, value]) =>
                          value && (
                            <Badge
                              key={key}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-5"
                            >
                              {value}
                            </Badge>
                          )
                      )}
                    </div>
                  )}
                </div>

                {/* Result previews */}
                {entry.resultPreviews.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground border-t pt-2">
                      Top results:
                    </div>
                    {entry.resultPreviews.map((mono) => (
                      <MiniMonologueCard key={mono.id} monologue={mono} />
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                  <span>{entry.resultCount} results</span>
                  <span>{formatRelativeTime(entry.timestamp)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {history.length >= maxSearches && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/search")}
              className="gap-2"
            >
              View All Searches
              <IconSearch className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
