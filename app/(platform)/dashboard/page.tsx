"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { 
  IconSparkles, 
  IconUserCheck, 
  IconArrowRight, 
  IconBookmark, 
  IconX, 
  IconEye, 
  IconEyeOff, 
  IconDownload, 
  IconMicrophone,
  IconVideo,
  IconInfoCircle
} from "@tabler/icons-react";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Monologue } from "@/types/actor";
import RecentSearches from "@/components/search/RecentSearches";
import BookmarksQuickAccess from "@/components/bookmarks/BookmarksQuickAccess";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { useProfileStats, useProfile, useRecommendations, useDiscover } from "@/hooks/useDashboardData";
import { useBookmarkCount, useToggleFavorite } from "@/hooks/useBookmarks";
import { useQuery } from "@tanstack/react-query";

function cleanImageUrl(url: string) {
  return url.trim().split("?")[0].split("#")[0];
}

function getInitials(displayName: string) {
  const cleaned = displayName.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  const token = parts[0];
  const emailUser = token.includes("@") ? token.split("@")[0] : token;
  return emailUser.slice(0, 2).toUpperCase();
}

// Quick Actions Component - Only shows actionable items
function QuickActions({ stats }: { stats: any }) {
  const showProfilePrompt = stats && stats.completion_percentage < 100;
  
  if (!showProfilePrompt) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6"
    >
      <Card className="border-accent/20 bg-accent/5 rounded-xl">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/20">
                <IconUserCheck className="h-5 w-5 text-accent" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Complete your profile</h3>
                <p className="text-xs text-muted-foreground">
                  {stats.completion_percentage}% complete - get better recommendations
                </p>
              </div>
            </div>
            <Button asChild size="sm">
              <Link href="/profile">
                Complete
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // React Query hooks
  const { data: stats, isLoading: isLoadingStats } = useProfileStats();
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const { count: bookmarkCount } = useBookmarkCount();
  const isProfileComplete = stats && stats.completion_percentage >= 50;
  const { data: recommendations = [], isLoading: isLoadingRecommendations } = useRecommendations(isProfileComplete ?? false);
  const { data: discoverMonologues = [], isLoading: isLoadingDiscover } = useDiscover(!(isProfileComplete ?? false));
  const mainMonologues = isProfileComplete ? recommendations : discoverMonologues;
  const isLoadingMain = isProfileComplete ? isLoadingRecommendations : isLoadingDiscover;
  const toggleFavoriteMutation = useToggleFavorite();

  // Fetch monologue detail
  const { data: monologueDetail } = useQuery<Monologue | null>({
    queryKey: ["monologue", selectedMonologue?.id],
    queryFn: async () => {
      if (!selectedMonologue?.id) return null;
      const response = await api.get<Monologue>(`/api/monologues/${selectedMonologue.id}`);
      return response.data;
    },
    enabled: !!selectedMonologue?.id && !isLoadingDetail,
  });

  // Update selected monologue when detail loads
  useEffect(() => {
    if (monologueDetail) {
      setSelectedMonologue(monologueDetail);
    }
  }, [monologueDetail]);

  const headshotUrl = profile?.headshot_url ? cleanImageUrl(profile.headshot_url) : null;
  const displayName = profile?.name || user?.name || user?.email || "Actor";

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

  const toggleFavorite = async (e: React.MouseEvent, mono: Monologue) => {
    e.stopPropagation();
    toggleFavoriteMutation.mutate({
      monologueId: mono.id,
      isFavorited: mono.is_favorited ?? false,
    });
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

  const currentMonologue = monologueDetail || selectedMonologue;

  const greetingName = profile?.name?.trim().split(/\s+/)[0] || null;
  const showWelcomeSkeleton = isLoadingProfile;
  // Only show full-page loader when we have no cached data (initial load); otherwise show content immediately
  const showFullPageLoader =
    (isLoadingStats && stats === undefined) || (isLoadingProfile && profile === undefined);

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-7xl">
      {/* Full dashboard loading state only on true initial load (no cached profile/stats) */}
      {showFullPageLoader && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center py-24 gap-6"
        >
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <IconSparkles className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-muted-foreground font-medium">Loading your dashboard...</p>
          <p className="text-sm text-muted-foreground/80">Fetching your profile and stats</p>
        </motion.div>
      )}

      {!showFullPageLoader && (
        <>
      {/* Welcome Header - no "Actor" flash; skeleton or name once loaded */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {showWelcomeSkeleton ? (
          <>
            <Skeleton className="h-9 w-64 mb-2 rounded-xl" />
            <Skeleton className="h-5 w-48 rounded-xl" />
          </>
        ) : (
          <>
            <h1 className="text-3xl lg:text-4xl font-bold mb-1 text-foreground">
              Welcome back{greetingName ? `, ${greetingName}` : ''}
            </h1>
            <p className="text-muted-foreground text-sm">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </>
        )}
      </motion.div>

      <Separator className="mb-8" />

      {/* Quick Actions - Only shows if profile incomplete */}
      <QuickActions stats={stats} />

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content - Recommendations */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-2xl font-semibold text-foreground">
                  {isProfileComplete ? "Recommended for you" : "Discover"}
                </h2>
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link href="/search">
                    View all
                    <IconArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {isProfileComplete ? "For you" : "Explore"}
              </p>
            </div>
            <Card className="rounded-xl">
              <CardContent className="pt-6">
                {isLoadingMain ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {isProfileComplete ? "Personalizing…" : "Loading…"}
                    </p>
                    <div className="grid md:grid-cols-2 gap-5">
                      {[1, 2, 3, 4].map((i) => (
                        <Card key={i} className="border-border/50 overflow-hidden rounded-xl">
                          <CardContent className="pt-6 flex flex-col gap-4">
                            <div className="space-y-2">
                              <Skeleton className="h-5 w-3/4 rounded-md" />
                              <Skeleton className="h-4 w-1/2 rounded-md" />
                              <Skeleton className="h-3 w-1/3 rounded-md" />
                            </div>
                            <Skeleton className="h-12 flex-1 rounded-md" />
                            <div className="flex justify-between pt-4 border-t">
                              <Skeleton className="h-4 w-12 rounded-md" />
                              <Skeleton className="h-4 w-16 rounded-md" />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ) : mainMonologues.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-5">
                    {mainMonologues.map((mono, idx) => (
                      <motion.div
                        key={mono.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05, duration: 0.3, ease: "easeOut" }}
                      >
                        <Card
                          className="hover:shadow-xl transition-all cursor-pointer h-full flex flex-col hover:border-secondary/50 group border-border/50 rounded-xl"
                          onClick={() => openMonologue(mono)}
                        >
                          <CardContent className="pt-6 flex-1 flex flex-col">
                            <div className="space-y-4 flex-1">
                              {/* Header - same as search */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-xl mb-1.5 group-hover:text-foreground transition-colors">
                                      {mono.character_name}
                                    </h3>
                                    {mono.is_favorited && (
                                      <span className="px-2 py-0.5 bg-accent/20 text-accent-foreground text-xs font-semibold rounded-full">
                                        Bookmarked
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    {mono.play_title}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    by {mono.author}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => toggleFavorite(e, mono)}
                                  className={`p-2 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                                    mono.is_favorited
                                      ? "bg-accent/10 hover:bg-accent/20 text-accent"
                                      : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                                  }`}
                                  aria-label={mono.is_favorited ? "Remove bookmark" : "Add bookmark"}
                                >
                                  <IconBookmark
                                    className={`h-5 w-5 ${mono.is_favorited ? "fill-current" : ""}`}
                                  />
                                </button>
                              </div>

                              {/* Preview */}
                              <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                                {mono.text.substring(0, 180)}...
                              </p>
                            </div>

                            {/* Footer - same as search */}
                            <div className="mt-5 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
                              <span className="font-medium">
                                {Math.floor(mono.estimated_duration_seconds / 60)}:
                                {(mono.estimated_duration_seconds % 60).toString().padStart(2, "0")} min
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
                ) : (
                  <div className="text-center py-16">
                    <IconSparkles className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No recommendations available
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
          </motion.div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Quick Actions
            </h3>
            
            <Link href="/scenes" className="block group">
              <Card className="hover:shadow-sm transition-all hover:border-secondary/40 border-border/50 rounded-xl">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                      <IconMicrophone className="h-4 w-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm group-hover:text-foreground transition-colors">
                        Voice ScenePartner
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        Practice scenes with AI
                      </p>
                    </div>
                    <IconArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/audition" className="block group">
              <Card className="hover:shadow-sm transition-all hover:border-secondary/40 border-border/50 rounded-xl">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-secondary/10 group-hover:bg-secondary/20 transition-colors">
                      <IconVideo className="h-4 w-4 text-secondary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm group-hover:text-foreground transition-colors">
                        Audition Mode
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        Record & get feedback
                      </p>
                    </div>
                    <IconArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Recent Searches */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">
              Recent Searches
            </h3>
            <RecentSearches maxSearches={4} compact />
          </div>

          {/* Bookmarks */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3">
              Your Monologues
            </h3>
            <BookmarksQuickAccess onSelectMonologue={openMonologue} />
          </div>
        </div>
      </div>

      {/* Slide-over Detail Panel */}
      <AnimatePresence>
        {currentMonologue && (
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
                  {!isReadingMode && <h2 className="text-2xl font-bold">Monologue Details</h2>}
                  {isReadingMode && <div className="flex-1" />}
                  <div className="flex items-center gap-2">
                    {/* Download button */}
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
                            className="fixed inset-0 z-[10003]"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-xl shadow-lg p-1 min-w-[140px] z-[10004]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(currentMonologue, 'text');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-xl transition-colors"
                            >
                              Download as TXT
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(currentMonologue, 'pdf');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-xl transition-colors"
                            >
                              Download as PDF
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {!isReadingMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(e as any, currentMonologue);
                        }}
                        className={`p-2 rounded-full transition-colors cursor-pointer relative z-[10002] ${
                          currentMonologue.is_favorited
                            ? "bg-accent/10 hover:bg-accent/20 text-accent"
                            : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                        }`}
                        aria-label={currentMonologue.is_favorited ? "Remove bookmark" : "Add bookmark"}
                      >
                        <IconBookmark
                          className={`h-5 w-5 ${currentMonologue.is_favorited ? "fill-current" : ""}`}
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
                  /* Reading Mode */
                  <div className="space-y-8 py-12">
                    <div className="text-center space-y-2">
                      <h1 className="text-4xl font-bold font-typewriter">{currentMonologue.character_name}</h1>
                      <div>
                        <p className="text-xl font-semibold font-typewriter text-muted-foreground">{currentMonologue.play_title}</p>
                        <p className="text-muted-foreground font-typewriter">by {currentMonologue.author}</p>
                      </div>
                    </div>
                    <div className="bg-background p-8 rounded-lg">
                      <p className="text-xl leading-relaxed whitespace-pre-wrap font-typewriter max-w-3xl mx-auto text-center">
                        {currentMonologue.text}
                      </p>
                    </div>
                  </div>
                ) : (
                  <MonologueDetailContent
                    monologue={currentMonologue}
                    showOpenInNewPage
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
}
