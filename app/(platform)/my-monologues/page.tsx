"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { IconBookmark, IconX, IconEye, IconEyeOff, IconDownload, IconSparkles, IconArrowsSort, IconFlag } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Monologue } from "@/types/actor";
import Link from "next/link";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { MonologueText } from "@/components/monologue/MonologueText";
import { MonologueResultCard } from "@/components/monologue/MonologueResultCard";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useBookmarks, useToggleFavorite } from "@/hooks/useBookmarks";
import { useFilmTvFavorites, useToggleFilmTvFavorite } from "@/hooks/useFilmTvFavorites";
import { FilmTvReferenceCard } from "@/components/search/FilmTvReferenceCard";
import { accentTeal } from "@/components/search/MatchIndicatorTag";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import type { FilmTvReference } from "@/types/filmTv";
import { getFilmTvScriptUrl } from "@/lib/utils";
import { IconDeviceTv } from "@tabler/icons-react";

export type MyMonologuesSort = "last_added" | "character_az" | "character_za" | "play_az" | "play_za" | "author_az";

export default function MyMonologuesPage() {
  const { data: favorites = [], isLoading } = useBookmarks();
  const { data: filmTvFavorites = [], isLoading: isLoadingFilmTv } = useFilmTvFavorites();
  const toggleFavoriteMutation = useToggleFavorite();
  const toggleFilmTvFavoriteMutation = useToggleFilmTvFavorite();
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [selectedFilmTvRef, setSelectedFilmTvRef] = useState<FilmTvReference | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [sort, setSort] = useState<MyMonologuesSort>("last_added");
  const [savedTab, setSavedTab] = useState<"theater" | "film_tv">("theater");

  const sortedFavorites = useMemo(() => {
    if (sort === "last_added") return [...favorites];
    const cmp = (a: Monologue, b: Monologue) => {
      switch (sort) {
        case "character_az":
          return (a.character_name ?? "").localeCompare(b.character_name ?? "", undefined, { sensitivity: "base" });
        case "character_za":
          return (b.character_name ?? "").localeCompare(a.character_name ?? "", undefined, { sensitivity: "base" });
        case "play_az":
          return (a.play_title ?? "").localeCompare(b.play_title ?? "", undefined, { sensitivity: "base" });
        case "play_za":
          return (b.play_title ?? "").localeCompare(a.play_title ?? "", undefined, { sensitivity: "base" });
        case "author_az":
          return (a.author ?? "").localeCompare(b.author ?? "", undefined, { sensitivity: "base" });
        default:
          return 0;
      }
    };
    return [...favorites].sort(cmp);
  }, [favorites, sort]);

  const openMonologue = async (mono: Monologue) => {
    setSelectedMonologue(mono);
    setIsLoadingDetail(true);
    setIsReadingMode(false);
    try {
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

  const toggleFavorite = (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    if (selectedMonologue?.id === mono.id) setSelectedMonologue(null);
    toggleFavoriteMutation.mutate({ monologueId: mono.id, isFavorited: mono.is_favorited ?? true });
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

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-3xl lg:text-4xl font-bold mb-2">Saved</h1>
        <p className="text-muted-foreground">
          Theater monologues and film & TV references you&apos;ve saved for later
        </p>
      </motion.div>

      <Tabs value={savedTab} onValueChange={(v) => setSavedTab(v as "theater" | "film_tv")} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 h-11 rounded-lg">
          <TabsTrigger value="theater" className="gap-2">
            <IconBookmark className="h-4 w-4" />
            Theater
            {!isLoading && favorites.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {favorites.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="film_tv" className="gap-2">
            <IconDeviceTv className="h-4 w-4" />
            Film & TV
            {!isLoadingFilmTv && filmTvFavorites.length > 0 && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                {filmTvFavorites.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="theater" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <IconBookmark className="h-5 w-5 text-primary" />
                Theater monologues ({favorites.length})
              </CardTitle>
              {favorites.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="my-monologues-sort" className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1.5">
                    <IconArrowsSort className="h-4 w-4" />
                    Sort
                  </Label>
                  <Select
                    value={sort}
                    onValueChange={(v) => setSort(v as MyMonologuesSort)}
                  >
                    <SelectTrigger id="my-monologues-sort" className="w-[180px] rounded-lg">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last_added">Last added</SelectItem>
                      <SelectItem value="character_az">Character A–Z</SelectItem>
                      <SelectItem value="character_za">Character Z–A</SelectItem>
                      <SelectItem value="play_az">Play A–Z</SelectItem>
                      <SelectItem value="play_za">Play Z–A</SelectItem>
                      <SelectItem value="author_az">Author A–Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : favorites.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedFavorites.map((mono, idx) => (
                    <MonologueResultCard
                      key={mono.id}
                      mono={mono}
                      onSelect={() => openMonologue(mono)}
                      onToggleFavorite={toggleFavorite}
                      variant="default"
                      index={idx}
                      showMatchBadge={false}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <IconBookmark className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No saved theater monologues yet</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Start exploring monologues and bookmark your favorites. They&apos;ll appear here for easy access.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/search">
                      Browse Monologues
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="film_tv" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconDeviceTv className="h-5 w-5 text-primary" />
                Film & TV ({filmTvFavorites.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingFilmTv ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filmTvFavorites.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filmTvFavorites.map((ref, idx) => (
                    <FilmTvReferenceCard
                      key={ref.id}
                      ref_item={ref}
                      index={idx}
                      onSelect={() => setSelectedFilmTvRef(ref)}
                      isFavorited
                      onToggleFavorite={() => {
                        toggleFilmTvFavoriteMutation.mutate({
                          referenceId: ref.id,
                          isFavorited: true,
                        });
                        if (selectedFilmTvRef?.id === ref.id) setSelectedFilmTvRef(null);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <IconDeviceTv className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No saved film & TV yet</h3>
                  <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Search film & TV in the search page and save references to scripts. They&apos;ll appear here.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/search?mode=film_tv">
                      Search Film & TV
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Slide-over Detail Panel (monologue) */}
      <AnimatePresence>
        {selectedMonologue && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isReadingMode ? 0.95 : 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeMonologue}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`fixed inset-0 z-[10000] ${
                isReadingMode ? "bg-black/95" : "bg-black/50"
              }`}
            />

            {/* Slide-over Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`fixed right-0 top-0 bottom-0 z-[10001] overflow-y-auto transition-all ${
                isReadingMode
                  ? "w-full bg-background"
                  : "w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl"
              }`}
            >
              <div className={`sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002] ${
                isReadingMode ? "border-b-0" : ""
              }`}>
                <div className="flex items-center justify-between p-6">
                  {!isReadingMode && <h2 className="hidden sm:block text-2xl font-bold">Monologue Details</h2>}
                  <div className="flex-1 sm:hidden" />
                  <div className="flex items-center gap-2">
                    <TooltipProvider delayDuration={300}>
                    {/* Download button */}
                    <div className="relative">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(!showDownloadMenu);
                            }}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 hover:bg-muted text-muted-foreground hover:text-primary"
                          >
                            <IconDownload className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download TXT or PDF</TooltipContent>
                      </Tooltip>
                      {showDownloadMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-[10003]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-[10004]">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(e as any, selectedMonologue);
                        }}
                        className={`min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 active:scale-95 transition-all duration-200 ease-out ${
                          selectedMonologue.is_favorited
                            ? `${accentTeal.bg} ${accentTeal.bgHover} ${accentTeal.text}`
                            : `${accentTeal.hoverBg} ${accentTeal.textHover} text-muted-foreground`
                        }`}
                        aria-label={selectedMonologue.is_favorited ? "Remove bookmark" : "Add bookmark"}
                      >
                        <BookmarkIcon filled={!!selectedMonologue.is_favorited} size="md" />
                      </Button>
                    )}
                    {!isReadingMode && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReportOpen(true);
                            }}
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label="Report an issue"
                          >
                            <IconFlag className="h-5 w-5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Report an issue with this monologue</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsReadingMode(!isReadingMode);
                          }}
                          className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 hover:bg-muted"
                        >
                          {isReadingMode ? (
                            <IconEyeOff className="h-5 w-5" />
                          ) : (
                            <IconEye className="h-5 w-5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isReadingMode ? "Exit reading mode" : "Reading mode"}</TooltipContent>
                    </Tooltip>
                    <Button variant="ghost" size="icon" onClick={closeMonologue} className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0">
                      <IconX className="h-5 w-5" />
                    </Button>
                    </TooltipProvider>
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
                      <p className="text-xl leading-relaxed font-typewriter max-w-3xl mx-auto text-center">
                        <MonologueText text={selectedMonologue.text} />
                      </p>
                    </div>
                  </div>
                ) : (
                  <MonologueDetailContent
                    monologue={selectedMonologue}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Film & TV detail slide-over */}
      <AnimatePresence>
        {selectedFilmTvRef && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFilmTvRef(null)}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-[10000] bg-black/50"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed right-0 top-0 bottom-0 z-[10001] w-full md:w-[600px] bg-background border-l shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002]">
                <div className="flex items-center justify-between p-6">
                  <h2 className="text-xl font-bold truncate">
                    {selectedFilmTvRef.type === "tvSeries" ? "TV details" : "Movie details"}
                  </h2>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedFilmTvRef(null)}>
                    <IconX className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{selectedFilmTvRef.title}</h1>
                  <p className="text-muted-foreground text-sm mt-1">
                    {selectedFilmTvRef.year ?? ""}
                    {selectedFilmTvRef.director ? ` · ${selectedFilmTvRef.director}` : ""}
                  </p>
                </div>
                {selectedFilmTvRef.plot && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedFilmTvRef.plot}</p>
                )}
                <Button asChild variant="default" size="sm">
                  <a
                    href={getFilmTvScriptUrl(selectedFilmTvRef)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Script
                  </a>
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {selectedMonologue && (
        <ReportMonologueModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          monologueId={selectedMonologue.id}
          characterName={selectedMonologue.character_name}
          playTitle={selectedMonologue.play_title}
        />
      )}
    </div>
  );
}
