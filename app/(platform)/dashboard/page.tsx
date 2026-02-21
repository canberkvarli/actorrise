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
} from "@tabler/icons-react";
import { BookmarkIcon } from "@/components/ui/bookmark-icon";
import {
  IconEye,
  IconEyeOff,
  IconDownload,
  IconInfoCircle,
  IconSearch,
  IconHistory,
  IconChevronRight,
  IconSend,
  IconFlag,
  IconDeviceTv,
  IconExternalLink,
  IconEdit,
  IconLoader2,
  IconFileText,
} from "@tabler/icons-react";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Monologue } from "@/types/actor";
import RecentSearches from "@/components/search/RecentSearches";
import BookmarksQuickAccess from "@/components/bookmarks/BookmarksQuickAccess";
import ScriptsQuickAccess from "@/components/scripts/ScriptsQuickAccess";
import { ContactModalTrigger } from "@/components/contact/ContactModalTrigger";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MonologueDetailContent } from "@/components/monologue/MonologueDetailContent";
import { ReportMonologueModal } from "@/components/monologue/ReportMonologueModal";
import { useProfileStats, useProfile, useRecommendations, useDiscover, useDiscoverFilmTv } from "@/hooks/useDashboardData";
import { useBookmarkCount, useToggleFavorite } from "@/hooks/useBookmarks";
import { useFilmTvFavorites, useToggleFilmTvFavorite } from "@/hooks/useFilmTvFavorites";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FilmTvReferenceCard } from "@/components/search/FilmTvReferenceCard";
import { accentTeal } from "@/components/search/MatchIndicatorTag";
import type { FilmTvReference } from "@/types/filmTv";
import { getFilmTvScriptUrl, getScriptSearchUrl, getScriptSlugUrl } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { EditMonologueModal } from "@/components/admin/EditMonologueModal";
import type { EditMonologueBody } from "@/components/admin/EditMonologueModal";

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

const FILM_TV_LAST_SEARCH_KEY = "film_tv_search_last_results_v1";

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selectedFilmTvRef, setSelectedFilmTvRef] = useState<FilmTvReference | null>(null);
  const [filmTvPosterError, setFilmTvPosterError] = useState(false);
  const [filmTvEditScriptOpen, setFilmTvEditScriptOpen] = useState(false);
  const [filmTvEditScriptValue, setFilmTvEditScriptValue] = useState("");
  const [filmTvEditScriptSaving, setFilmTvEditScriptSaving] = useState(false);
  const [editMonologueId, setEditMonologueId] = useState<number | null>(null);
  const [editMonologueSaving, setEditMonologueSaving] = useState(false);
  const queryClient = useQueryClient();

  // Reset poster error when opening a different Film/TV so the image loads again
  useEffect(() => {
    if (selectedFilmTvRef) setFilmTvPosterError(false);
  }, [selectedFilmTvRef?.id]);

  // React Query hooks
  const { data: stats, isLoading: isLoadingStats } = useProfileStats();
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const { count: bookmarkCount } = useBookmarkCount();
  const isProfileComplete = stats && stats.completion_percentage >= 50;
  const { data: recommendations = [], isLoading: isLoadingRecommendations } = useRecommendations(isProfileComplete ?? false);
  const { data: discoverMonologues = [], isLoading: isLoadingDiscover } = useDiscover(!(isProfileComplete ?? false));
  const mainMonologues = isProfileComplete ? recommendations : discoverMonologues;
  const isLoadingMain = isProfileComplete ? isLoadingRecommendations : isLoadingDiscover;
  const { data: discoverFilmTv = [], isLoading: isLoadingFilmTv } = useDiscoverFilmTv();
  const toggleFavoriteMutation = useToggleFavorite();
  const { data: filmTvFavorites = [] } = useFilmTvFavorites();
  const toggleFilmTvFavoriteMutation = useToggleFilmTvFavorite();
  const savedFilmTvIds = new Set(filmTvFavorites.map((r) => r.id));

  // Optional: last Film & TV search for "Continue" chip (sessionStorage, client-only)
  const [lastFilmTvSearch, setLastFilmTvSearch] = useState<{ query: string } | null>(null);
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(FILM_TV_LAST_SEARCH_KEY) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw) as { query?: string };
      if (parsed?.query != null && String(parsed.query).trim() !== "") {
        setLastFilmTvSearch({ query: String(parsed.query).trim() });
      }
    } catch {
      // ignore
    }
  }, []);

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
  const showStatsSkeleton = isLoadingStats && stats === undefined;

  const sectionEase = [0.25, 0.1, 0.25, 1] as const;
  const sectionDuration = 0.4;
  const sectionStagger = 0.06;

  return (
    <div className="container mx-auto px-4 lg:px-8 py-6 md:py-8 max-w-7xl">
      <div className="space-y-12">
          {/* ========== UNIFIED HERO: welcome, headline, search CTA (Option A – search first) ========== */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: sectionDuration, ease: sectionEase }}
            className="rounded-xl bg-muted/30 dark:bg-muted/20 p-6 md:p-8"
          >
            {/* Row 1: compact welcome (left) + Complete profile CTA (right) */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                {showWelcomeSkeleton ? (
                  <Skeleton className="h-5 w-56 rounded-lg" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    {greetingName ? ` · Welcome back, ${greetingName}` : ''}
                  </p>
                )}
              </div>
              <div className="min-h-[44px] flex items-center">
                {showStatsSkeleton && (
                  <Skeleton className="h-11 w-64 rounded-lg" />
                )}
                {!showStatsSkeleton && stats && stats.completion_percentage < 100 && (
                  <Link
                    href="/profile"
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-400/10 dark:border-amber-400/25 hover:bg-amber-500/15 dark:hover:bg-amber-400/15 transition-colors text-left w-fit max-w-[280px] sm:max-w-none"
                  >
                    <IconUserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-sm font-medium text-foreground">Complete your profile</span>
                    <span className="text-xs text-muted-foreground">({stats.completion_percentage}%)</span>
                    <IconArrowRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                  </Link>
                )}
              </div>
            </div>

            {/* Headline: primary focus above search card */}
            {showWelcomeSkeleton ? (
              <Skeleton className="h-9 w-72 md:w-96 rounded-lg mb-6" />
            ) : (
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-6">
                Find your next monologue
              </h1>
            )}

            {/* Search card: primary CTA, full width within hero */}
            <Link
              href="/search"
              className="block group max-w-3xl"
              aria-label="Find your next monologue — search by description, emotion, character type, or browse filters"
            >
              <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-md transition-all">
                <div className="p-3 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                  <IconSearch className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: sectionDuration, delay: sectionStagger * 2, ease: sectionEase }}
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
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[280px]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-6 bg-card border border-border rounded-xl min-h-[260px]">
                    <Skeleton className="h-6 w-3/4 mb-3 rounded-md" />
                    <Skeleton className="h-4 w-1/2 mb-2 rounded-md" />
                    <Skeleton className="h-4 w-1/3 mb-4 rounded-md" />
                    <Skeleton className="h-20 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : mainMonologues.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[280px]">
                {mainMonologues.slice(0, 4).map((mono, idx) => (
                  <motion.div
                    key={mono.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: idx * 0.04, ease: sectionEase }}
                    className="group p-6 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg transition-all cursor-pointer h-full flex flex-col min-h-[260px]"
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
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {user?.is_moderator && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditMonologueId(mono.id);
                              }}
                              aria-label="Edit monologue"
                            >
                              <IconEdit className="h-4 w-4" />
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(e, mono)}
                            className={`min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-full transition-colors duration-200 ease-out ${
                              mono.is_favorited
                                ? `${accentTeal.bg} ${accentTeal.text}`
                                : `${accentTeal.hoverBg} ${accentTeal.textHover} text-muted-foreground/50`
                            }`}
                          >
                            <BookmarkIcon filled={!!mono.is_favorited} size="md" />
                          </button>
                        </div>
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
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-card border border-border rounded-xl min-h-[280px] flex flex-col items-center justify-center">
                <IconSparkles className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">No recommendations yet</p>
                <p className="text-muted-foreground mb-6">Complete your profile or search to discover monologues</p>
                <Button asChild>
                  <Link href="/search">Browse Monologues</Link>
                </Button>
              </div>
            )}
          </motion.section>

          {/* ========== SECTION 4: Film & TV ========== */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: sectionDuration, delay: sectionStagger * 3, ease: sectionEase }}
            className="space-y-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                  <IconDeviceTv className="h-7 w-7 shrink-0 text-primary" />
                  <span className="truncate">Film & TV</span>
                </h2>
                <p className="text-muted-foreground mt-1">
                  Top picks by IMDb rating · Search for more by scene or title
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground hover:text-foreground w-fit">
                <Link href="/search?mode=film_tv" className="whitespace-nowrap">
                  View all
                  <IconArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>

            {lastFilmTvSearch && (
              <div className="min-w-0 max-w-full">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto max-w-full text-muted-foreground hover:bg-muted hover:text-foreground justify-start sm:justify-center border-border"
                  onClick={() => router.push("/search?mode=film_tv")}
                >
                  <IconHistory className="h-4 w-4 shrink-0 mr-2" />
                  <span className="truncate">
                    Continue: &quot;{lastFilmTvSearch.query.length > 35 ? lastFilmTvSearch.query.slice(0, 35) + "…" : lastFilmTvSearch.query}&quot;
                  </span>
                </Button>
              </div>
            )}

            {isLoadingFilmTv ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[240px]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-6 bg-card border border-border rounded-xl min-h-[200px]">
                    <Skeleton className="h-6 w-3/4 mb-3 rounded-md" />
                    <Skeleton className="h-4 w-1/2 mb-2 rounded-md" />
                    <Skeleton className="h-4 w-1/3 mb-4 rounded-md" />
                    <Skeleton className="h-20 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : discoverFilmTv.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 min-h-[240px]">
                {discoverFilmTv.slice(0, 4).map((ref, idx) => (
                  <FilmTvReferenceCard
                    key={ref.id}
                    ref_item={ref}
                    index={idx}
                    compact
                    onSelect={() => setSelectedFilmTvRef(ref)}
                    isFavorited={savedFilmTvIds.has(ref.id)}
                    onToggleFavorite={() => {
                      toggleFilmTvFavoriteMutation.mutate({
                        referenceId: ref.id,
                        isFavorited: savedFilmTvIds.has(ref.id),
                        refForOptimistic: ref,
                      });
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-14 px-6 bg-card border border-border rounded-xl min-h-[240px] flex flex-col items-center justify-center">
                <IconDeviceTv className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">Explore Film & TV</p>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Search for film and TV references by scene, theme, or title
                </p>
                <Button asChild>
                  <Link href="/search?mode=film_tv">Search Film & TV</Link>
                </Button>
              </div>
            )}
          </motion.section>

          {/* ========== SECTION 5: Your Monologues, Your Scripts, Recent Searches ========== */}
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: sectionDuration, delay: sectionStagger * 4, ease: sectionEase }}
          >
            <div className="w-full grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,1fr))] gap-8 items-stretch">
              {/* Your Monologues */}
              <div className="min-w-0 flex flex-col w-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <IconBookmark className={`h-5 w-5 shrink-0 ${accentTeal.text}`} />
                    Your Monologues
                  </h2>
                  <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                    <Link href="/my-monologues" className="whitespace-nowrap">
                      View all
                      <IconArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <BookmarksQuickAccess onSelectMonologue={openMonologue} />
                </div>
              </div>

              {/* Your Scripts */}
              <div className="min-w-0 flex flex-col w-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <IconFileText className="h-5 w-5 text-amber-500 shrink-0" />
                    Your Scripts
                  </h2>
                  <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
                    <Link href="/my-scripts" className="whitespace-nowrap">
                      View all
                      <IconArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <ScriptsQuickAccess />
                </div>
              </div>

              {/* Recent Searches */}
              <div className="min-w-0 flex flex-col w-full">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <IconHistory className="h-5 w-5 text-muted-foreground shrink-0" />
                    Recent Searches
                  </h2>
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <RecentSearches maxSearches={isMobile ? 2 : 4} compact />
                </div>
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
                  {!isReadingMode && <h2 className="hidden sm:block text-2xl font-bold">Monologue Details</h2>}
                  <div className="flex-1 sm:hidden" />
                  <div className="flex items-center gap-2">
                    {/* Download button - 44px touch target on mobile */}
                    <TooltipProvider delayDuration={300}>
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
                            className="hover:bg-muted text-muted-foreground hover:text-primary min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
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
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(e as any, currentMonologue);
                        }}
                        className={`relative z-[10002] active:scale-95 transition-all duration-200 ease-out min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 ${
                          currentMonologue.is_favorited
                            ? `${accentTeal.bg} ${accentTeal.bgHover} ${accentTeal.text}`
                            : `${accentTeal.hoverBg} ${accentTeal.textHover} text-muted-foreground`
                        }`}
                        aria-label={currentMonologue.is_favorited ? "Remove bookmark" : "Add bookmark"}
                      >
                        <BookmarkIcon filled={!!currentMonologue.is_favorited} size="md" />
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
                            className="hover:bg-muted text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
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
                          className="hover:bg-muted min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeMonologue}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    >
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
                    onEdit={user?.is_moderator ? (id) => setEditMonologueId(id) : undefined}
                  />
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Film & TV slide-over detail panel */}
      <AnimatePresence>
        {selectedFilmTvRef && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedFilmTvRef(null);
                setFilmTvPosterError(false);
              }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="fixed inset-0 z-[10000] bg-black/50"
            />
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut", opacity: { duration: 0.25 } }}
              className="fixed right-0 top-0 bottom-0 z-[10001] w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl overflow-y-auto"
            >
              <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b z-[10002]">
                <div className="flex items-center justify-between gap-2 p-6">
                  <h2 className="text-2xl font-bold truncate">
                    {selectedFilmTvRef.type === "tvSeries" ? "TV details" : "Movie details"}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (selectedFilmTvRef)
                          toggleFilmTvFavoriteMutation.mutate({
                            referenceId: selectedFilmTvRef.id,
                            isFavorited: savedFilmTvIds.has(selectedFilmTvRef.id),
                            refForOptimistic: selectedFilmTvRef,
                          });
                      }}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 transition-colors duration-200 ease-out"
                      title={savedFilmTvIds.has(selectedFilmTvRef.id) ? "Remove from saved" : "Add to saved"}
                      aria-label={savedFilmTvIds.has(selectedFilmTvRef.id) ? "Remove from saved" : "Add to saved"}
                    >
                      <BookmarkIcon filled={savedFilmTvIds.has(selectedFilmTvRef.id)} size="md" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedFilmTvRef(null);
                        setFilmTvPosterError(false);
                      }}
                      className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
                    >
                      <IconX className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="flex items-start gap-4">
                  {selectedFilmTvRef.poster_url && !filmTvPosterError ? (
                    <Image
                      key={`film-tv-poster-${selectedFilmTvRef.id}`}
                      src={selectedFilmTvRef.poster_url}
                      alt={selectedFilmTvRef.title}
                      width={160}
                      height={240}
                      className="w-40 rounded-md object-cover shadow-sm shrink-0 aspect-[2/3]"
                      unoptimized
                      onError={() => setFilmTvPosterError(true)}
                    />
                  ) : (
                    <div className="w-40 shrink-0 rounded-md bg-muted flex items-center justify-center aspect-[2/3] text-muted-foreground/40">
                      <IconDeviceTv className="h-10 w-10" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <h1 className="text-2xl font-bold text-foreground leading-tight">{selectedFilmTvRef.title}</h1>
                      {selectedFilmTvRef.is_best_match && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted/90 text-foreground border border-border">
                          Best Match
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {selectedFilmTvRef.year ?? ""}
                      {selectedFilmTvRef.director ? ` · Directed by ${selectedFilmTvRef.director}` : ""}
                    </p>
                    {selectedFilmTvRef.imdb_rating != null && (
                      <p className="text-sm font-semibold text-amber-500 mt-1">
                        ★ {selectedFilmTvRef.imdb_rating.toFixed(1)} IMDb
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedFilmTvRef.type && (
                    <Badge variant="secondary" className="capitalize">
                      {selectedFilmTvRef.type === "tvSeries" ? "TV Series" : "Movie"}
                    </Badge>
                  )}
                  {selectedFilmTvRef.genre?.map((g) => (
                    <Badge key={g} variant="outline" className="capitalize">{g}</Badge>
                  ))}
                </div>

                {selectedFilmTvRef.actors && selectedFilmTvRef.actors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Cast</p>
                    <p className="text-sm text-foreground">{selectedFilmTvRef.actors.join(", ")}</p>
                  </div>
                )}

                {selectedFilmTvRef.plot && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Plot</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{selectedFilmTvRef.plot}</p>
                  </div>
                )}

                {selectedFilmTvRef.confidence_score != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full tabular-nums bg-muted text-muted-foreground">
                    {Math.round(selectedFilmTvRef.confidence_score * 100)}% match
                  </span>
                )}

                {user?.is_moderator && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>ID: {selectedFilmTvRef.id}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilmTvEditScriptValue(
                          selectedFilmTvRef.imsdb_url?.trim() ?? getFilmTvScriptUrl(selectedFilmTvRef)
                        );
                        setFilmTvEditScriptOpen(true);
                      }}
                    >
                      <IconEdit className="h-3.5 w-3.5" />
                      Edit script link
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(getFilmTvScriptUrl(selectedFilmTvRef), "_blank", "noopener,noreferrer")}
                  >
                    <IconExternalLink className="h-4 w-4" />
                    Script on IMSDb
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(getScriptSlugUrl(selectedFilmTvRef.title, selectedFilmTvRef.year), "_blank", "noopener,noreferrer")}
                  >
                    <IconExternalLink className="h-4 w-4" />
                    Script on Script Slug
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(getScriptSearchUrl(selectedFilmTvRef.title), "_blank", "noopener,noreferrer")}
                  >
                    <IconExternalLink className="h-4 w-4" />
                    Search Google
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => window.open(`https://www.imdb.com/title/${selectedFilmTvRef.imdb_id}/`, "_blank", "noopener,noreferrer")}
                  >
                    <IconExternalLink className="h-4 w-4" />
                    IMDb page
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Try IMSDb first, then Script Slug. If the script isn&apos;t there, use Search Google.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Dialog open={filmTvEditScriptOpen} onOpenChange={setFilmTvEditScriptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit script link</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Override the IMSDb script URL for this title (e.g. IMSDb uses &quot;Godfather&quot; but we show &quot;The Godfather&quot;). Leave empty to use the auto-generated URL from the title.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="film-tv-script-url">Script URL</Label>
            <Input
              id="film-tv-script-url"
              value={filmTvEditScriptValue}
              onChange={(e) => setFilmTvEditScriptValue(e.target.value)}
              placeholder="https://imsdb.com/scripts/Godfather.html"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilmTvEditScriptOpen(false)}
              disabled={filmTvEditScriptSaving}
            >
              Cancel
            </Button>
            <Button
              disabled={filmTvEditScriptSaving}
              onClick={async () => {
                if (!selectedFilmTvRef) return;
                setFilmTvEditScriptSaving(true);
                try {
                  const res = await api.patch<{ imsdb_url: string | null }>(
                    `/api/admin/film-tv/${selectedFilmTvRef.id}`,
                    { imsdb_url: filmTvEditScriptValue.trim() || null }
                  );
                  setSelectedFilmTvRef((prev) =>
                    prev ? { ...prev, imsdb_url: res.data.imsdb_url } : null
                  );
                  setFilmTvEditScriptOpen(false);
                  toast.success("Script link updated");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Update failed");
                } finally {
                  setFilmTvEditScriptSaving(false);
                }
              }}
            >
              {filmTvEditScriptSaving ? (
                <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditMonologueModal
        monologueId={editMonologueId}
        onClose={() => setEditMonologueId(null)}
        onSave={async (body: EditMonologueBody) => {
          if (editMonologueId == null) return;
          setEditMonologueSaving(true);
          try {
            await api.patch(`/api/admin/monologues/${editMonologueId}`, body);
            queryClient.invalidateQueries({ queryKey: ["recommendations"] });
            queryClient.invalidateQueries({ queryKey: ["discover"] });
            queryClient.invalidateQueries({ queryKey: ["monologue", editMonologueId] });
            toast.success("Monologue updated");
            setEditMonologueId(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Update failed");
          } finally {
            setEditMonologueSaving(false);
          }
        }}
        isSaving={editMonologueSaving}
      />

      {currentMonologue && (
        <ReportMonologueModal
          open={reportOpen}
          onOpenChange={setReportOpen}
          monologueId={currentMonologue.id}
          characterName={currentMonologue.character_name}
          playTitle={currentMonologue.play_title}
        />
      )}
    </div>
  );
}
