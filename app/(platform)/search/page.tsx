"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconFilter, IconHeart } from "@tabler/icons-react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { motion, AnimatePresence } from "framer-motion";

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    gender: "",
    age_range: "",
    emotion: "",
    theme: "",
    category: "",
  });
  const [results, setResults] = useState<Monologue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ q: query, limit: "20" });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const response = await api.get(`/api/monologues/search?${params.toString()}`);
      setResults(response.data);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const activeFilters = Object.entries(filters).filter(([_, value]) => value !== "");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MonologueMatch</h1>
        <p className="text-muted-foreground">
          AI-powered monologue discovery for actors
        </p>
      </div>

      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search" className="flex items-center gap-2">
                  <IconSparkles className="h-4 w-4 text-primary" />
                  Semantic Search
                </Label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      id="search"
                      placeholder='Try "sad monologue about loss" or "funny piece for young woman"'
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    />
                    {query && (
                      <button
                        onClick={() => setQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <IconX className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <Button onClick={handleSearch} disabled={isLoading || !query.trim()}>
                    {isLoading ? (
                      <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <IconSearch className="h-4 w-4 mr-2" />
                    )}
                    Search
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
                    <IconFilter className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {showFilters && (
                <div className="space-y-3 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <IconFilter className="h-4 w-4" />
                    Filters
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[
                      { key: "gender", label: "Gender", options: ["male", "female", "any"] },
                      { key: "age_range", label: "Age Range", options: ["teens", "20s", "30s", "40s", "50s", "60+"] },
                      { key: "emotion", label: "Emotion", options: ["joy", "sadness", "anger", "fear", "melancholy", "hope"] },
                      { key: "theme", label: "Theme", options: ["love", "death", "betrayal", "identity", "power", "revenge"] },
                      { key: "category", label: "Category", options: ["classical", "contemporary"] },
                    ].map(({ key, label, options }) => (
                      <div key={key} className="space-y-2">
                        <Label className="text-xs">{label}</Label>
                        <select
                          value={filters[key as keyof typeof filters]}
                          onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-md border border-input bg-background"
                        >
                          <option value="">Any</option>
                          {options.map(opt => (
                            <option key={opt} value={opt} className="capitalize">{opt}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {activeFilters.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {activeFilters.map(([key, value]) => (
                        <Badge key={key} variant="secondary" className="gap-1">
                          {key}: {value}
                          <button
                            onClick={() => setFilters({ ...filters, [key]: "" })}
                            className="ml-1 hover:text-destructive"
                          >
                            <IconX className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : hasSearched && results.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <IconSearch className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No monologues found</h3>
                <p className="text-sm text-muted-foreground">
                  Try different search terms or adjust filters
                </p>
              </CardContent>
            </Card>
          ) : results.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-semibold">{results.length}</span> monologues
              </p>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map((mono, idx) => (
                  <motion.div
                    key={mono.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                  >
                    <Card
                      className="hover:shadow-lg transition-all cursor-pointer h-full flex flex-col hover:border-primary/50"
                      onClick={() => router.push(`/monologue/${mono.id}`)}
                    >
                      <CardContent className="pt-6 flex-1 flex flex-col">
                        <div className="space-y-3 flex-1">
                          <div>
                            <h3 className="font-semibold text-lg mb-1">{mono.character_name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {mono.play_title} by {mono.author}
                            </p>
                          </div>

                          {/* Details - Backstage.com Style */}
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground w-16">Genre:</span>
                              <Badge variant="outline" className="capitalize">
                                {mono.category}
                              </Badge>
                            </div>
                            {mono.character_gender && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground w-16">Gender:</span>
                                <Badge variant="outline" className="capitalize">
                                  {mono.character_gender}
                                </Badge>
                              </div>
                            )}
                            {mono.character_age_range && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground w-16">Age Range:</span>
                                <Badge variant="outline">
                                  {mono.character_age_range}
                                </Badge>
                              </div>
                            )}
                            {mono.primary_emotion && (
                              <div className="flex items-center gap-2">
                                <span className="text-muted-foreground w-16">Emotion:</span>
                                <Badge variant="secondary" className="capitalize">
                                  {mono.primary_emotion}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {/* Themes */}
                          {mono.themes && mono.themes.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-xs text-muted-foreground">Themes:</span>
                              <div className="flex flex-wrap gap-1">
                                {mono.themes.slice(0, 3).map(theme => (
                                  <span key={theme} className="text-xs px-2 py-1 bg-muted rounded capitalize">
                                    {theme}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Preview Text */}
                          <p className="text-sm line-clamp-2 text-muted-foreground border-t pt-3">
                            {mono.text.substring(0, 120)}...
                          </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                          <span>{Math.floor(mono.estimated_duration_seconds / 60)}:{(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')} min</span>
                          <span>{mono.word_count} words</span>
                          <button
                            className="text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Handle favorite toggle
                            }}
                          >
                            <IconHeart className={`h-4 w-4 ${mono.is_favorited ? 'fill-current text-red-500' : ''}`} />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
