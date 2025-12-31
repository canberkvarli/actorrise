"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconFilter } from "@tabler/icons-react";
import { SearchRequest } from "@/types/actor";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { MonologueCard } from "./MonologueCard";
import { motion, AnimatePresence } from "framer-motion";

export function SearchInterface() {
  const [profileBias, setProfileBias] = useState(true);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    age_range: "",
    gender: "",
    genre: "",
    theme: "",
    category: "",
  });
  const [results, setResults] = useState<Monologue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Load search history from localStorage
  useEffect(() => {
    const history = localStorage.getItem("monologue_search_history");
    if (history) {
      setSearchHistory(JSON.parse(history));
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim() && !profileBias) return;
    
    setIsLoading(true);
    setHasSearched(true);
    try {
      const searchRequest: SearchRequest = {
        query: query || undefined,
        profile_bias: profileBias,
        filters: profileBias ? undefined : filters,
      };

      const response = await api.post("/api/search", searchRequest);
      setResults(response.data.results);
      
      // Save to search history
      if (query.trim()) {
        const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 5);
        setSearchHistory(newHistory);
        localStorage.setItem("monologue_search_history", JSON.stringify(newHistory));
      }
    } catch (error) {
      console.error("Search error:", error);
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
              {/* Profile Bias Toggle */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center justify-between pb-4 border-b"
              >
                <div className="space-y-0.5">
                  <Label htmlFor="profile-bias" className="text-base font-semibold flex items-center gap-2">
                    <IconSparkles className="h-4 w-4 text-primary" />
                    AI-Powered Search
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Enable semantic search with personalized recommendations based on your profile
                  </p>
                </div>
                <Switch
                  id="profile-bias"
                  checked={profileBias}
                  onChange={(e) => setProfileBias(e.target.checked)}
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
                      <IconSparkles className="h-4 w-4 text-primary animate-pulse" />
                      Smart Search
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          id="smart-search"
                          placeholder="What kind of monologue are you looking for? (e.g., emotional, comedic, dramatic)"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                          className="pr-10"
                        />
                        {query && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => setQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                      <div className="flex gap-2">
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
                            id="age-range"
                            value={filters.age_range}
                            onChange={(e) =>
                              setFilters({ ...filters, age_range: e.target.value })
                            }
                          >
                            <option value="">All</option>
                            <option value="18-25">18-25</option>
                            <option value="25-35">25-35</option>
                            <option value="35-45">35-45</option>
                            <option value="45-55">45-55</option>
                            <option value="55+">55+</option>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gender">Gender</Label>
                          <Select
                            id="gender"
                            value={filters.gender}
                            onChange={(e) =>
                              setFilters({ ...filters, gender: e.target.value })
                            }
                          >
                            <option value="">All</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Non-binary">Non-binary</option>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="genre">Genre</Label>
                          <Select
                            id="genre"
                            value={filters.genre}
                            onChange={(e) =>
                              setFilters({ ...filters, genre: e.target.value })
                            }
                          >
                            <option value="">All</option>
                            <option value="Drama">Drama</option>
                            <option value="Comedy">Comedy</option>
                            <option value="Classical">Classical</option>
                            <option value="Shakespeare">Shakespeare</option>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="theme">Theme</Label>
                          <Select
                            id="theme"
                            value={filters.theme}
                            onChange={(e) =>
                              setFilters({ ...filters, theme: e.target.value })
                            }
                          >
                            <option value="">All Themes</option>
                            <option value="Love">Love</option>
                            <option value="Loss">Loss</option>
                            <option value="Desire">Desire</option>
                            <option value="Broken Promises">Broken Promises</option>
                            <option value="Rejection">Rejection</option>
                            <option value="Change">Change</option>
                            <option value="Identity">Identity</option>
                            <option value="Conflict">Conflict</option>
                            <option value="Redemption">Redemption</option>
                            <option value="Ambition">Ambition</option>
                            <option value="Revenge">Revenge</option>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="category">Category</Label>
                          <Select
                            id="category"
                            value={filters.category}
                            onChange={(e) =>
                              setFilters({ ...filters, category: e.target.value })
                            }
                          >
                            <option value="">All Categories</option>
                            <option value="Contemporary">Contemporary</option>
                            <option value="Classical">Classical</option>
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
              <div className="text-center space-y-4">
                <IconLoader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Searching monologues...</p>
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
