"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
  IconInfoCircle,
  IconSearch,
  IconHistory,
  IconChevronRight,
  IconSend
} from "@tabler/icons-react";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Monologue } from "@/types/actor";
import RecentSearches from "@/components/search/RecentSearches";
import BookmarksQuickAccess from "@/components/bookmarks/BookmarksQuickAccess";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";
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
        <div className="space-y-12">
          {/* ========== SECTION 1: Hero Welcome + optional Complete profile ========== */}
          <motion.section
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
          >
            {showWelcomeSkeleton ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-80 rounded-lg" />
                <Skeleton className="h-6 w-56 rounded-lg" />
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-primary mb-2">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                  Welcome back{greetingName ? `, ${greetingName}` : ''}
                </h1>
              </div>
            )}
            {!showWelcomeSkeleton && stats && stats.completion_percentage < 100 && (
              <Link
                href="/profile"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-400/10 dark:border-amber-400/25 hover:bg-amber-500/15 dark:hover:bg-amber-400/15 transition-colors text-left max-w-[280px] sm:max-w-none"
              >
                <IconUserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-sm font-medium text-foreground">Complete your profile</span>
                <span className="text-xs text-muted-foreground hidden sm:inline">({stats.completion_percentage}%)</span>
                <IconArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
              </Link>
            )}
          </motion.section>

          {/* ========== SECTION 2: Quick Search (primary CTA) ========== */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Link href="/search" className="block group max-w-2xl">
              <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-md transition-all">
                <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <IconSearch className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                    Find your next monologue
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Search by description, emotion, character type, or browse filters
                  </p>
                </div>
                <IconChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
              </div>
            </Link>
          </motion.section>

          {/* ========== SECTION 3: Recommendations ========== */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  {isProfileComplete ? "Recommended for you" : "Discover monologues"}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {isProfileComplete ? "Personalized picks based on your profile" : "Explore our curated collection"}
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground">
                <Link href="/search" className="whitespace-nowrap">
                  View all
                  <IconArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>

            {isLoadingMain ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-6 bg-card border border-border rounded-xl">
                    <Skeleton className="h-6 w-3/4 mb-3 rounded-md" />
                    <Skeleton className="h-4 w-1/2 mb-2 rounded-md" />
                    <Skeleton className="h-4 w-1/3 mb-4 rounded-md" />
                    <Skeleton className="h-20 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : mainMonologues.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {mainMonologues.slice(0, 4).map((mono, idx) => (
                  <motion.div
                    key={mono.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                  >
                    <div
                      className="group p-6 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full flex flex-col"
                      onClick={() => openMonologue(mono)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {mono.character_name}
                          </h3>
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {mono.play_title}
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            by {mono.author}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(e, mono)}
                          className={`p-2 rounded-full transition-colors flex-shrink-0 ${
                            mono.is_favorited
                              ? "bg-violet-500/15 text-violet-500 dark:text-violet-400"
                              : "hover:bg-violet-500/15 hover:text-violet-500 text-muted-foreground/50"
                          }`}
                        >
                          <IconBookmark className={`h-5 w-5 ${mono.is_favorited ? "fill-current" : ""}`} />
                        </button>
                      </div>

                      <p className="text-sm text-muted-foreground line-clamp-3 flex-1 leading-relaxed">
                        "{mono.text.substring(0, 120)}..."
                      </p>

                      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {Math.floor(mono.estimated_duration_seconds / 60)}:{(mono.estimated_duration_seconds % 60).toString().padStart(2, "0")}
                        </span>
                        <span className="text-border">•</span>
                        <span>{mono.word_count} words</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <IconSparkles className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">No recommendations yet</p>
                <p className="text-muted-foreground mb-6">Complete your profile or search to discover monologues</p>
                <Button asChild>
                  <Link href="/search">Browse Monologues</Link>
                </Button>
              </div>
            )}
          </motion.section>

          {/* ========== SECTION 5: Bookmarks & Recent Searches ========== */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl">
              {/* Bookmarks */}
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <IconBookmark className="h-5 w-5 text-violet-500" />
                    Your Monologues
                  </h2>
                  <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                    <Link href="/my-monologues" className="whitespace-nowrap">
                      View all
                      <IconArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <BookmarksQuickAccess onSelectMonologue={openMonologue} />
              </div>

              {/* Recent Searches */}
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <IconHistory className="h-5 w-5 text-muted-foreground" />
                    Recent Searches
                  </h2>
                </div>
                <RecentSearches maxSearches={4} compact />
              </div>
            </div>

            {/* Submit a monologue: secondary CTA below the grid */}
            <div className="mt-6 pt-6 border-t border-border/50 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Have a monologue to share with the community?</span>
              <Link
                href="/submit-monologue"
                className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary transition-colors"
              >
                <IconSend className="h-4 w-4" />
                Submit a monologue
              </Link>
            </div>

            {/* Contact: feedback, bugs, partnership */}
            <div className="mt-4 pt-4 border-t border-border/40 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Questions, feedback, or want to collaborate?</span>
              <ContactModalTrigger variant="ghost" className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-primary">
                Get in touch
              </ContactModalTrigger>
            </div>
          </motion.section>
        </div>
      )}

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
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-[10004]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(currentMonologue, 'text');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
                            >
                              Download as TXT
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadMonologue(currentMonologue, 'pdf');
                                setShowDownloadMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-lg transition-colors"
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
                            ? "bg-violet-500/15 hover:bg-violet-500/25 text-violet-500 dark:text-violet-400"
                            : "hover:bg-violet-500/15 hover:text-violet-500 text-muted-foreground"
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
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
