"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconSearch, IconClock, IconX, IconArrowRight, IconDeviceTv } from "@tabler/icons-react";
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
  const [history, setHistory] = useState<SearchHistoryEntry[]>(() =>
    getSearchHistory().slice(0, maxSearches)
  );

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

  const compactCardClass = "rounded-lg border border-border/50 min-h-[280px] flex flex-col";
  const compactContentClass = "pt-4 pb-4 flex flex-col flex-1 min-h-[252px]";

  if (history.length === 0) {
    if (compact) {
      return (
        <Card className={compactCardClass}>
          <CardContent className={compactContentClass}>
            <div className="flex flex-col items-center justify-center flex-1 py-8 px-4 text-center">
              <div className="rounded-full bg-muted/80 p-4 mb-3 text-muted-foreground">
                <IconSearch className="h-8 w-8" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-foreground">No recent searches</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your last searches will show up here
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Button asChild size="sm" variant="default" className="gap-1.5 rounded-lg">
                  <Link href="/search">
                    <IconSearch className="h-3.5 w-3.5" />
                    Search monologues
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-lg">
                  <Link href="/search?mode=film_tv">
                    <IconDeviceTv className="h-3.5 w-3.5" />
                    Film & TV
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="rounded-lg border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <IconClock className="h-5 w-5" />
            Recent Searches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl bg-muted/30 border border-dashed border-border/60">
            <div className="rounded-full bg-background border border-border/80 shadow-sm p-5 mb-4">
              <IconSearch className="h-10 w-10 text-muted-foreground" strokeWidth={1.25} />
            </div>
            <p className="text-base font-semibold text-foreground">No recent searches yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-[240px]">
              Search for monologues or film & TV scenes — they&apos;ll appear here for quick access.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <Button asChild size="sm" variant="default" className="gap-2 rounded-lg">
                <Link href="/search">
                  <IconSearch className="h-4 w-4" />
                  Search monologues
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-2 rounded-lg">
                <Link href="/search?mode=film_tv">
                  <IconDeviceTv className="h-4 w-4" />
                  Film & TV
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    const searchRowBase =
      "flex items-center gap-3 w-full text-left p-4 rounded-lg border border-border/60 transition-all duration-200 group " +
      "hover:shadow-md hover:border-secondary/50 hover:bg-secondary/5 cursor-pointer";
    return (
      <Card className={compactCardClass}>
        <CardContent className={compactContentClass}>
          <div className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.id}
                onClick={() => handleSearchClick(entry)}
                className={searchRowBase}
              >
                <div className="p-2 rounded-full bg-muted/80 text-muted-foreground flex-shrink-0" aria-hidden>
                  <IconSearch className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {entry.query || "Browse all"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(entry.timestamp)}
                  </p>
                </div>
                <IconArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </div>
            ))}
            {history.length >= maxSearches && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-fit shrink-0 rounded-lg border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground text-sm mt-1"
              >
                <Link href="/search" className="cursor-pointer text-inherit hover:text-inherit whitespace-nowrap">
                  View all searches
                  <IconArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
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
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
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
                  className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors z-10"
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
                  {Object.entries(entry.filters).some(([, value]) => value) && (
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
