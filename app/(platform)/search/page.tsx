"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { IconSearch, IconSparkles, IconLoader2, IconX, IconFilter, IconBookmark, IconExternalLink, IconEye, IconEyeOff, IconDownload } from "@tabler/icons-react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { motion, AnimatePresence } from "framer-motion";
import { addSearchToHistory, getSearchById } from "@/lib/searchHistory";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);

  // Restore search state from URL and sessionStorage on mount
  // This allows search results to persist across page refreshes
  useEffect(() => {
    // Check if this is a restoration from search history
    const historyId = searchParams.get("id");
    if (historyId) {
      const historyEntry = getSearchById(historyId);
      if (historyEntry) {
        setQuery(historyEntry.query);
        // Normalize filters to ensure all required fields are strings
        setFilters({
          gender: historyEntry.filters.gender || "",
          age_range: historyEntry.filters.age_range || "",
          emotion: historyEntry.filters.emotion || "",
          theme: historyEntry.filters.theme || "",
          category: historyEntry.filters.category || "",
        });
        setResults(historyEntry.resultPreviews);
        setHasSearched(true);
        return;
      }
    }

    const urlQuery = searchParams.get("q");
    const urlFilters: typeof filters = {
      gender: "",
      age_range: "",
      emotion: "",
      theme: "",
      category: "",
    };
    ["gender", "age_range", "emotion", "theme", "category"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) {
        urlFilters[key as keyof typeof filters] = value;
      }
    });

    // Restore from URL params
    if (urlQuery) {
      setQuery(urlQuery);
      setFilters(urlFilters);

      // Try to restore results from sessionStorage (fast, no API call)
      const storageKey = `search_results_${urlQuery}_${JSON.stringify(urlFilters)}`;
      const cachedResults = sessionStorage.getItem(storageKey);

      if (cachedResults) {
        try {
          const parsed = JSON.parse(cachedResults);
          setResults(parsed);
          setHasSearched(true);
        } catch (e) {
          console.error("Error parsing cached results:", e);
          // If cache is corrupted, perform fresh search
          performSearch(urlQuery, urlFilters);
        }
      } else {
        // If no cache but URL has query, perform fresh search
        performSearch(urlQuery, urlFilters);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - we don't want to re-trigger on searchParams changes

  const performSearch = async (searchQuery: string, searchFilters: typeof filters) => {
    setIsLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ q: searchQuery, limit: "20" });
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });

      const response = await api.get<Monologue[]>(`/api/monologues/search?${params.toString()}`);
      setResults(response.data);

      // Cache results in sessionStorage
      const storageKey = `search_results_${searchQuery}_${JSON.stringify(searchFilters)}`;
      sessionStorage.setItem(storageKey, JSON.stringify(response.data));

      // Add to search history
      addSearchToHistory({
        query: searchQuery,
        filters: searchFilters,
        resultPreviews: response.data.slice(0, 3),
        resultCount: response.data.length,
      });

      // Update URL without page reload
      const newParams = new URLSearchParams();
      newParams.set("q", searchQuery);
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) newParams.set(key, value);
      });
      router.replace(`/search?${newParams.toString()}`, { scroll: false });
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    await performSearch(query, filters);
  };

  const openMonologue = async (mono: Monologue) => {
    setSelectedMonologue(mono);
    setIsLoadingDetail(true);
    try {
      // Fetch full details
      const response = await api.get<Monologue>(`/api/monologues/${mono.id}`);
      setSelectedMonologue(response.data);
    } catch (error) {
      console.error("Error fetching monologue:", error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeMonologue = () => {
    setSelectedMonologue(null);
    setIsReadingMode(false);
    setShowDownloadMenu(false);
  };

  const downloadMonologue = (mono: Monologue, format: 'text' | 'pdf' = 'text') => {
    if (format === 'text') {
      const content = `MONOLOGUE: ${mono.character_name}
From: ${mono.play_title} by ${mono.author}

${mono.scene_description ? `SCENE DESCRIPTION:\n${mono.scene_description}\n\n` : ''}MONOLOGUE TEXT:\n${mono.text}${mono.stage_directions ? `\n\nSTAGE DIRECTIONS:\n${mono.stage_directions}` : ''}

---
Duration: ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}
Word Count: ${mono.word_count}
${mono.primary_emotion ? `Primary Emotion: ${mono.primary_emotion}` : ''}
${mono.character_gender ? `Character Gender: ${mono.character_gender}` : ''}
${mono.character_age_range ? `Age Range: ${mono.character_age_range}` : ''}
`;

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mono.character_name.replace(/\s+/g, '_')}_${mono.play_title.replace(/\s+/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // PDF download using browser's print functionality
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${mono.character_name} - ${mono.play_title}</title>
  <style>
    @media print {
      @page {
        margin: 1in;
      }
    }
    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 {
      font-size: 24px;
      margin-bottom: 10px;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    h2 {
      font-size: 18px;
      margin-top: 20px;
      margin-bottom: 10px;
      color: #666;
    }
    .metadata {
      font-size: 14px;
      color: #666;
      margin-bottom: 20px;
      padding: 10px;
      background-color: #f5f5f5;
      border-left: 3px solid #333;
    }
    .monologue-text {
      font-size: 16px;
      line-height: 1.8;
      margin: 20px 0;
      white-space: pre-wrap;
      text-align: justify;
    }
    .stage-directions {
      font-style: italic;
      color: #666;
      margin-top: 15px;
      padding: 10px;
      background-color: #f9f9f9;
      border-left: 2px solid #ccc;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${mono.character_name}</h1>
  <div class="metadata">
    <strong>From:</strong> ${mono.play_title} by ${mono.author}<br>
    ${mono.character_gender ? `<strong>Character Gender:</strong> ${mono.character_gender}<br>` : ''}
    ${mono.character_age_range ? `<strong>Age Range:</strong> ${mono.character_age_range}<br>` : ''}
    ${mono.primary_emotion ? `<strong>Primary Emotion:</strong> ${mono.primary_emotion}<br>` : ''}
    <strong>Duration:</strong> ${Math.floor(mono.estimated_duration_seconds / 60)}:${(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')}<br>
    <strong>Word Count:</strong> ${mono.word_count}
  </div>
  
  ${mono.scene_description ? `<h2>Scene Description</h2><p class="stage-directions">${mono.scene_description}</p>` : ''}
  
  <h2>Monologue</h2>
  <div class="monologue-text">${mono.text.replace(/\n/g, '<br>')}</div>
  
  ${mono.stage_directions ? `<div class="stage-directions"><strong>Stage Directions:</strong> ${mono.stage_directions}</div>` : ''}
  
  <div class="footer">
    <p>Downloaded from ActorRise</p>
  </div>
  
  <script>
    window.onload = function() {
      window.print();
      setTimeout(() => window.close(), 100);
    };
  </script>
</body>
</html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    try {
      if (mono.is_favorited) {
        await api.delete(`/api/monologues/${mono.id}/favorite`);
        // Update in results
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: false, favorite_count: m.favorite_count - 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: false, favorite_count: selectedMonologue.favorite_count - 1 });
        }
      } else {
        await api.post(`/api/monologues/${mono.id}/favorite`);
        setResults(results.map(m => m.id === mono.id ? { ...m, is_favorited: true, favorite_count: m.favorite_count + 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: true, favorite_count: selectedMonologue.favorite_count + 1 });
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  };

  const activeFilters = Object.entries(filters).filter(([, value]) => value !== "");

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Find Your Monologue</h1>
        <p className="text-muted-foreground text-lg">
          Search thousands of classical and contemporary monologues
        </p>
      </div>

      <div className="space-y-6">
        {/* Search Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search" className="text-base font-semibold">
                  Search
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
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                          {key.replace("_", " ")}: {value}
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

        {/* Results */}
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
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {showBookmarkedOnly ? (
                    <>
                      Showing <span className="font-semibold">
                        {results.filter((m) => m.is_favorited).length}
                      </span> bookmarked monologues
                    </>
                  ) : (
                    <>
                      Found <span className="font-semibold">{results.length}</span> monologues
                    </>
                  )}
                </p>
                <Button
                  variant={showBookmarkedOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                  className="gap-2"
                >
                  <IconBookmark className={`h-4 w-4 ${showBookmarkedOnly ? "fill-current" : ""}`} />
                  Bookmarked Only
                </Button>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(showBookmarkedOnly ? results.filter((m) => m.is_favorited) : results).map((mono, idx) => (
                  <motion.div
                    key={mono.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3, ease: "easeOut" }}
                  >
                    <Card
                      className="hover:shadow-xl transition-all cursor-pointer h-full flex flex-col hover:border-primary/50 group"
                      onClick={() => openMonologue(mono)}
                    >
                      <CardContent className="pt-6 flex-1 flex flex-col">
                        <div className="space-y-4 flex-1">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-xl mb-1 group-hover:text-primary transition-colors">
                                  {mono.character_name}
                                </h3>
                                {mono.is_favorited && (
                                  <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-semibold rounded-full border border-accent/20">
                                    Bookmarked
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {mono.play_title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                by {mono.author}
                              </p>
                            </div>
                            <button
                              onClick={(e) => toggleFavorite(e, mono)}
                              className={`p-2 rounded-full transition-colors ${
                                mono.is_favorited
                                  ? 'bg-accent/10 hover:bg-accent/20 text-accent'
                                  : 'hover:bg-muted text-muted-foreground hover:text-accent'
                              }`}
                            >
                              <IconBookmark
                                className={`h-5 w-5 ${
                                  mono.is_favorited
                                    ? 'fill-current'
                                    : ''
                                }`}
                              />
                            </button>
                          </div>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="default" className="font-normal capitalize">
                              {mono.category}
                            </Badge>
                            {mono.character_gender && (
                              <Badge variant="outline" className="font-normal capitalize">
                                {mono.character_gender}
                              </Badge>
                            )}
                            {mono.character_age_range && (
                              <Badge variant="outline" className="font-normal">
                                {mono.character_age_range}
                              </Badge>
                            )}
                            {mono.primary_emotion && (
                              <Badge variant="secondary" className="font-normal capitalize">
                                {mono.primary_emotion}
                              </Badge>
                            )}
                          </div>

                          {/* Synopsis / Scene Description */}
                          {mono.scene_description && (
                            <div className="bg-muted/50 px-3 py-2 rounded-md border-l-2 border-primary/40">
                              <p className="text-xs italic text-muted-foreground line-clamp-2">
                                {mono.scene_description}
                              </p>
                            </div>
                          )}

                          {/* Themes */}
                          {mono.themes && mono.themes.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {mono.themes.slice(0, 3).map(theme => (
                                <span
                                  key={theme}
                                  className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-full font-medium capitalize"
                                >
                                  {theme}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Preview */}
                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            &ldquo;{mono.text.substring(0, 120)}...&rdquo;
                          </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium">
                            {Math.floor(mono.estimated_duration_seconds / 60)}:{(mono.estimated_duration_seconds % 60).toString().padStart(2, '0')} min
                          </span>
                          <span>{mono.word_count} words</span>
                          <span className="flex items-center gap-1">
                            <IconBookmark className="h-3 w-3" />
                            {mono.favorite_count}
                          </span>
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

      {/* Slide-over Detail Panel - Backstage.com Style */}
      <AnimatePresence>
        {selectedMonologue && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isReadingMode ? 0.95 : 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeMonologue}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className={`fixed inset-0 z-[9998] ${
                isReadingMode ? "bg-black/95" : "bg-black/50"
              }`}
            />

            {/* Slide-over Panel */}
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ 
                duration: 0.4,
                ease: [0.4, 0, 0.2, 1],
                opacity: { duration: 0.3 }
              }}
              className={`fixed right-0 top-0 bottom-0 z-[9999] overflow-y-auto transition-all ${
                isReadingMode
                  ? "w-full bg-background"
                  : "w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl"
              }`}
            >
              <div className={`sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10000] ${
                isReadingMode ? "border-b-0" : ""
              }`}>
                <div className="flex items-center justify-between p-6">
                  {!isReadingMode && <h2 className="text-2xl font-bold">Monologue Details</h2>}
                  {isReadingMode && <div className="flex-1" />}
                  <div className="flex items-center gap-2">
                    {/* Download button - show in both modes */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDownloadMenu(!showDownloadMenu);
                        }}
                        className="p-2 rounded-full transition-colors hover:bg-muted text-muted-foreground hover:text-primary"
                        title="Download monologue"
                      >
                        <IconDownload className="h-5 w-5" />
                      </button>
                      {showDownloadMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-[10000]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-[10001]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(selectedMonologue, 'text');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                            >
                              Download as TXT
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(selectedMonologue, 'pdf');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md transition-colors"
                            >
                              Download as PDF
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {!isReadingMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(e, selectedMonologue);
                        }}
                        className={`p-2 rounded-full transition-colors ${
                          selectedMonologue.is_favorited
                            ? 'bg-accent/10 hover:bg-accent/20 text-accent'
                            : 'hover:bg-muted text-muted-foreground hover:text-accent'
                        }`}
                      >
                        <IconBookmark
                          className={`h-5 w-5 ${
                            selectedMonologue.is_favorited
                              ? 'fill-current'
                              : ''
                          }`}
                        />
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsReadingMode(!isReadingMode);
                      }}
                      className="hover:bg-muted"
                    >
                      {isReadingMode ? (
                        <IconEyeOff className="h-5 w-5" />
                      ) : (
                        <IconEye className="h-5 w-5" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={closeMonologue}>
                      <IconX className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className={`${isReadingMode ? "max-w-4xl mx-auto" : ""} p-6 space-y-6`}>
                {isLoadingDetail ? (
                  <div className="space-y-4">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-64 w-full" />
                  </div>
                ) : isReadingMode ? (
                  /* Reading Mode - Centered and Focused */
                  <div className="space-y-8 py-12">
                    {/* Minimal Header */}
                    <div className="text-center space-y-2">
                      <h1 className="text-4xl font-bold font-typewriter">{selectedMonologue.character_name}</h1>
                      <div>
                        <p className="text-xl font-semibold font-typewriter text-muted-foreground">{selectedMonologue.play_title}</p>
                        <p className="text-muted-foreground font-typewriter">by {selectedMonologue.author}</p>
                      </div>
                    </div>

                    {/* Monologue Text - Large and Centered */}
                    <div className="bg-background p-8 rounded-lg">
                      <p className="text-xl leading-relaxed whitespace-pre-wrap font-typewriter max-w-3xl mx-auto text-center">
                        {selectedMonologue.text}
                      </p>
                    </div>

                    {/* Stage Directions - If Available */}
                    {selectedMonologue.stage_directions && (
                      <div className="bg-muted/30 p-6 rounded-lg border max-w-3xl mx-auto">
                        <p className="text-base italic text-muted-foreground text-center">
                          <span className="font-semibold not-italic">Stage Directions: </span>
                          {selectedMonologue.stage_directions}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="space-y-3">
                      <h1 className="text-3xl font-bold font-typewriter">{selectedMonologue.character_name}</h1>
                      <div>
                        <p className="text-lg font-semibold font-typewriter">{selectedMonologue.play_title}</p>
                        <p className="text-muted-foreground font-typewriter">by {selectedMonologue.author}</p>
                      </div>

                      {selectedMonologue.scene_description && (
                        <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
                          <p className="text-sm italic flex items-start gap-2">
                            <IconSparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                            {selectedMonologue.scene_description}
                          </p>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Details */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Details
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Character:</p>
                          <Badge variant="outline">{selectedMonologue.character_name}</Badge>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Genre:</p>
                          <Badge variant="outline" className="capitalize">{selectedMonologue.category}</Badge>
                        </div>
                        {selectedMonologue.character_gender && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Gender:</p>
                            <Badge variant="outline" className="capitalize">{selectedMonologue.character_gender}</Badge>
                          </div>
                        )}
                        {selectedMonologue.character_age_range && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Age Range:</p>
                            <Badge variant="outline">{selectedMonologue.character_age_range}</Badge>
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Category:</p>
                          <Badge variant="outline" className="capitalize">{selectedMonologue.category}</Badge>
                        </div>
                        {selectedMonologue.primary_emotion && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Emotion:</p>
                            <Badge className="capitalize">{selectedMonologue.primary_emotion}</Badge>
                          </div>
                        )}
                      </div>

                      {selectedMonologue.themes && selectedMonologue.themes.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <p className="text-xs text-muted-foreground">Themes:</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedMonologue.themes.map((theme) => (
                              <Badge key={theme} variant="secondary" className="capitalize">
                                {theme}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Separator />

                    {/* Monologue Text */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Monologue Text
                      </h3>
                      <div className="bg-muted/30 p-6 rounded-lg border">
                        <p className="text-base leading-relaxed whitespace-pre-wrap font-typewriter">
                          {selectedMonologue.text}
                        </p>
                      </div>

                      {selectedMonologue.stage_directions && (
                        <div className="bg-muted/50 p-4 rounded-lg border">
                          <p className="text-sm italic">
                            <span className="font-semibold not-italic">Stage Directions: </span>
                            {selectedMonologue.stage_directions}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Stats & Source */}
                    <Separator />
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="space-y-1">
                          <p className="text-2xl font-bold">
                            {Math.floor(selectedMonologue.estimated_duration_seconds / 60)}:{(selectedMonologue.estimated_duration_seconds % 60).toString().padStart(2, '0')}
                          </p>
                          <p className="text-xs text-muted-foreground">Duration</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-bold">{selectedMonologue.word_count}</p>
                          <p className="text-xs text-muted-foreground">Words</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-2xl font-bold">{selectedMonologue.favorite_count}</p>
                          <p className="text-xs text-muted-foreground">Favorites</p>
                        </div>
                      </div>

                      {selectedMonologue.source_url && (
                        <Button variant="outline" className="w-full hover:border-primary hover:text-primary" asChild>
                          <a
                            href={selectedMonologue.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2"
                          >
                            View Full Play
                            <IconExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
