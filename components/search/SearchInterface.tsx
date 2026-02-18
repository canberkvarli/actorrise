"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconFilter } from "@tabler/icons-react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { MonologueCard } from "./MonologueCard";
import { motion, AnimatePresence } from "framer-motion";
import { addSearchToHistory } from "@/lib/searchHistory";

type MonologueSearchResponse = {
  results: Monologue[];
  total: number;
  page: number;
  page_size: number;
};

const LOADING_MESSAGES = [
  "Clanking through the archives...",
  "Working our magic...",
  "Squeezing the monologue database...",
  "Asking Shakespeare for advice...",
  "Consulting the drama gods...",
  "Searching backstage...",
  "Finding your perfect piece...",
  "Digging through the classics...",
];

export function SearchInterface() {
  const [profileBias, setProfileBias] = useState(true);
  const [query, setQuery] = useState("");
  // Shared filter state (manual filters + era/category)
  const [filters, setFilters] = useState({
    age_range: "",
    gender: "",
    genre: "",
    theme: "",
    category: "",
  });
  // Era toggle: "" = either, "classical" or "contemporary"
  const [era, setEra] = useState<"" | "classical" | "contemporary">("");
  const [results, setResults] = useState<Monologue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  const PERSIST_KEY = "dashboard_monologue_search_v1";

  // Load persisted search state (results + query + filters) and history from storage
  useEffect(() => {
    try {
      const history = localStorage.getItem("monologue_search_history");
      if (history) {
        setSearchHistory(JSON.parse(history));
      }

      const persisted = typeof window !== "undefined" ? window.sessionStorage.getItem(PERSIST_KEY) : null;
      if (persisted) {
        const parsed = JSON.parse(persisted) as {
          query: string;
          profileBias: boolean;
          era: "" | "classical" | "contemporary";
          filters: typeof filters;
          results: Monologue[];
        };
        setQuery(parsed.query);
        setProfileBias(parsed.profileBias);
        setEra(parsed.era);
        setFilters(parsed.filters);
        setResults(parsed.results);
        setHasSearched(parsed.results.length > 0);
      }
    } catch (err) {
      console.error("Error restoring persisted dashboard search state:", err);
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim() && !profileBias) return;

    setIsLoading(true);
    setSearchError(null);
    setHasSearched(true);
    try {
      // Build effective filters, including era/category, in a single place
      const baseFilters = {
        ...(profileBias ? {} : filters),
      };

      // Era override for category (matches acting-world \"classical\" vs \"contemporary\")
      const effectiveCategory =
        era === "classical"
          ? "Classical"
          : era === "contemporary"
          ? "Contemporary"
          : (baseFilters as any).category || "";

      const effectiveFilters =
        effectiveCategory || !profileBias
          ? {
              ...(baseFilters as any),
              ...(effectiveCategory ? { category: effectiveCategory } : {}),
            }
          : undefined;

      // Build query params for unified monologue search endpoint
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set("q", query);
      }

      const effective = effectiveFilters || {};
      if ((effective as any).gender) params.set("gender", (effective as any).gender);
      if ((effective as any).age_range) params.set("age_range", (effective as any).age_range);
      if ((effective as any).emotion) params.set("emotion", (effective as any).emotion);
      if ((effective as any).theme) params.set("theme", (effective as any).theme);
      if ((effective as any).difficulty) params.set("difficulty", (effective as any).difficulty);
      if ((effective as any).category) params.set("category", (effective as any).category);
      if ((effective as any).author) params.set("author", (effective as any).author);
      if ((effective as any).max_duration)
        params.set("max_duration", String((effective as any).max_duration));

      params.set("limit", "20");

      const response = await api.get<MonologueSearchResponse>(
        `/api/monologues/search?${params.toString()}`,
        { timeoutMs: 180000 }
      );
      setResults(response.data.results);

      // Persist full search state so a refresh or navigation keeps results
      try {
        if (typeof window !== "undefined") {
          const payload = {
            query,
            profileBias,
            era,
            filters,
            results: response.data.results,
          };
          window.sessionStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
        }
      } catch (err) {
        console.error("Error persisting dashboard search state:", err);
      }

      // Save to old format for backward compatibility
      if (query.trim()) {
        const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
        setSearchHistory(newHistory);
        localStorage.setItem("monologue_search_history", JSON.stringify(newHistory));
      }

      // Save to new search history format
      const historyCategory = effectiveCategory || "";
      addSearchToHistory({
        query: query || "",
        filters: profileBias ? {} : {
          gender: filters.gender,
          age_range: filters.age_range,
          emotion: "",
          theme: filters.theme,
          category: historyCategory,
        },
        resultPreviews: response.data.results.slice(0, 3),
        resultCount: response.data.results.length,
      });
    } catch (error: unknown) {
      console.error("Search error:", error);
      const raw = (error as { response?: { data?: { detail?: string | { message?: string } } } })?.response?.data?.detail;
      const message =
        typeof raw === "string"
          ? raw
          : raw && typeof raw === "object" && "message" in raw
            ? (raw as { message: string }).message
            : error instanceof Error
              ? error.message
              : "Search failed. Please try again.";
      setSearchError(message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Auto-search when filters change (if profile bias is off)
    if (!profileBias && hasSearched) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [filters, profileBias]);

  // Rotate loading messages
  useEffect(() => {
    if (!isLoading) {
      setLoadingMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [isLoading]);

  const activeFilters = Object.entries(filters).filter(([_, value]) => value !== "");
  const hasActiveFilters = activeFilters.length > 0;

  const clearFilter = (key: string) => {
    setFilters({ ...filters, [key]: "" });
  };

  const clearAllFilters = () => {
    setFilters({
      age_range: "",
      gender: "",
      genre: "",
      theme: "",
      category: "",
    });
    setEra("");
  };

  const useHistoryItem = (item: string) => {
    setQuery(item);
    setTimeout(() => handleSearch(), 100);
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("monologue_search_history");
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="">
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* Era toggle - shared across AI and manual search modes */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.05 }}
                className="flex items-center justify-between pb-3"
              >
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Era</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose whether to search classical or contemporary monologues, or both
                  </p>
                </div>
                <div className="inline-flex rounded-full border border-secondary/50 bg-secondary/10 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setEra("");
                      setFilters(prev => ({ ...prev, category: "" }));
                    }}
                    className={`px-3 py-1.5 ${
                      era === ""
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    Either
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEra("contemporary");
                      setFilters(prev => ({ ...prev, category: "Contemporary" }));
                    }}
                    className={`px-3 py-1.5 border-l border-transparent ${
                      era === "contemporary"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    Contemporary
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEra("classical");
                      setFilters(prev => ({ ...prev, category: "Classical" }));
                    }}
                    className={`px-3 py-1.5 border-l border-transparent ${
                      era === "classical"
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    Classical
                  </button>
                </div>
              </motion.div>

              {/* Profile Bias Toggle */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center justify-between pb-4 border-b"
              >
                <div className="space-y-0.5">
                  <Label htmlFor="profile-bias" className="text-base font-semibold flex items-center gap-2">
                    <IconSparkles className="h-4 w-4 text-accent" />
                    AI-Powered Search
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Results are tailored to your profile (gender, age) when enabled. Match to your type and to the casting scenario. Just describe the audition in plain English.
                  </p>
                </div>
                <Switch
                  id="profile-bias"
                  checked={profileBias}
                  onCheckedChange={setProfileBias}
                />
              </motion.div>

              {/* Search Input */}
              <AnimatePresence mode="wait">
                {profileBias ? (
                  <motion.div
                    key="smart-search"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-2"
                  >
                      <Label htmlFor="smart-search" className="flex items-center gap-2">
                        <IconSparkles className="h-4 w-4 text-accent animate-pulse" />
                      Smart Search
                    </Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 relative flex items-center">
                        <Input
                          id="smart-search"
                          placeholder={`Try "to be or not to be" or "funny piece for a middle-aged man"`}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                          className="pr-10"
                        />
                        {query && (
                          <motion.button
                            type="button"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => setQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
                            aria-label="Clear search"
                          >
                            <IconX className="h-4 w-4" />
                          </motion.button>
                        )}
                      </div>
                      <Button onClick={handleSearch} disabled={isLoading} className="min-w-[100px]">
                        {isLoading ? (
                          <IconLoader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <IconSearch className="h-4 w-4" />
                            Search
                          </>
                        )}
                      </Button>
                    </div>
                    {searchHistory.length > 0 && (
                      <div className="relative flex flex-wrap gap-2 mt-2 border border-border rounded-lg p-3">
                        <span className="text-xs text-muted-foreground">Recent:</span>
                        {searchHistory.map((item, idx) => (
                          <motion.button
                            key={idx}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => useHistoryItem(item)}
                            className="text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {item}
                          </motion.button>
                        ))}

                        {/* X icon button - top right corner */}
                        <button
                          onClick={clearSearchHistory}
                          className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Clear search history"
                        >
                          <IconX className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="manual-search"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="search" className="flex items-center gap-2">
                        <IconSearch className="h-4 w-4" />
                        Search Monologues
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="search"
                          placeholder="Search by title, author, or excerpt..."
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                          className="flex-1"
                        />
                        <Button onClick={handleSearch} disabled={isLoading}>
                          {isLoading ? (
                            <IconLoader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <IconSearch className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Filters */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <IconFilter className="h-4 w-4" />
                          Filters
                        </Label>
                        {hasActiveFilters && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="text-xs"
                          >
                            Clear all
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="age-range">Age Range</Label>
                          <Select
                            value={filters.age_range || "__none__"}
                            onValueChange={(v) =>
                              setFilters({ ...filters, age_range: v === "__none__" ? "" : v })
                            }
                          >
                            <SelectTrigger id="age-range">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All</SelectItem>
                              <SelectItem value="18-25">18-25</SelectItem>
                              <SelectItem value="25-35">25-35</SelectItem>
                              <SelectItem value="35-45">35-45</SelectItem>
                              <SelectItem value="45-55">45-55</SelectItem>
                              <SelectItem value="55+">55+</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gender">Gender</Label>
                          <Select
                            value={filters.gender || "__none__"}
                            onValueChange={(v) =>
                              setFilters({ ...filters, gender: v === "__none__" ? "" : v })
                            }
                          >
                            <SelectTrigger id="gender">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All</SelectItem>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Non-binary">Non-binary</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="genre">Genre</Label>
                          <Select
                            value={filters.genre || "__none__"}
                            onValueChange={(v) =>
                              setFilters({ ...filters, genre: v === "__none__" ? "" : v })
                            }
                          >
                            <SelectTrigger id="genre">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All</SelectItem>
                              <SelectItem value="Drama">Drama</SelectItem>
                              <SelectItem value="Comedy">Comedy</SelectItem>
                              <SelectItem value="Classical">Classical</SelectItem>
                              <SelectItem value="Shakespeare">Shakespeare</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="theme">Theme</Label>
                          <Select
                            value={filters.theme || "__none__"}
                            onValueChange={(v) =>
                              setFilters({ ...filters, theme: v === "__none__" ? "" : v })
                            }
                          >
                            <SelectTrigger id="theme">
                              <SelectValue placeholder="All Themes" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All Themes</SelectItem>
                              <SelectItem value="Love">Love</SelectItem>
                              <SelectItem value="Loss">Loss</SelectItem>
                              <SelectItem value="Desire">Desire</SelectItem>
                              <SelectItem value="Broken Promises">Broken Promises</SelectItem>
                              <SelectItem value="Rejection">Rejection</SelectItem>
                              <SelectItem value="Change">Change</SelectItem>
                              <SelectItem value="Identity">Identity</SelectItem>
                              <SelectItem value="Conflict">Conflict</SelectItem>
                              <SelectItem value="Redemption">Redemption</SelectItem>
                              <SelectItem value="Ambition">Ambition</SelectItem>
                              <SelectItem value="Revenge">Revenge</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="category">Category</Label>
                          <Select
                            value={filters.category || "__none__"}
                            onValueChange={(value) => {
                              const categoryValue = value === "__none__" ? "" : value;
                              setFilters({ ...filters, category: categoryValue });
                              if (categoryValue === "Contemporary") {
                                setEra("contemporary");
                              } else if (categoryValue === "Classical") {
                                setEra("classical");
                              } else {
                                setEra("");
                              }
                            }}
                          >
                            <SelectTrigger id="category">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">All Categories</SelectItem>
                              <SelectItem value="Contemporary">Contemporary</SelectItem>
                              <SelectItem value="Classical">Classical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {hasActiveFilters && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="flex flex-wrap gap-2 pt-2"
                        >
                          {activeFilters.map(([key, value]) => (
                            <Badge
                              key={key}
                              variant="secondary"
                              className="gap-1"
                            >
                              {key.replace("_", " ")}: {value}
                              <button
                                onClick={() => clearFilter(key)}
                                className="ml-1 hover:text-destructive"
                              >
                                <IconX className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Error banner with retry */}
      {searchError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-destructive font-medium">{searchError}</p>
            <Button variant="outline" size="sm" onClick={() => handleSearch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-center p-12">
              <div className="text-center space-y-6">
                <div className="relative mx-auto w-16 h-16">
                  <div className="h-16 w-16 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  <IconSparkles className="h-7 w-7 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <motion.p
                  key={loadingMessageIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-lg font-medium text-foreground"
                >
                  {LOADING_MESSAGES[loadingMessageIndex]}
                </motion.p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="h-full">
                  <CardContent className="pt-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>
        ) : hasSearched && results.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="inline-block mb-4"
                >
                  <IconSearch className="h-16 w-16 text-muted-foreground/50" />
                </motion.div>
                <h3 className="text-lg font-semibold mb-2">No monologues found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Try adjusting your search terms or filters
                </p>
                <Button variant="outline" onClick={() => {
                  setQuery("");
                  setFilters({
                    age_range: "",
                    gender: "",
                    genre: "",
                    theme: "",
                    category: "",
                  });
                }}>
                  Clear Search
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : results.length > 0 ? (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between"
            >
              <p className="text-sm text-muted-foreground">
                Found <span className="font-semibold text-foreground">{results.length}</span> monologue{results.length !== 1 ? "s" : ""}
              </p>
            </motion.div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((monologue, index) => (
                <MonologueCard key={monologue.id} monologue={monologue} index={index} />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
