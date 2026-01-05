"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { IconSparkles, IconUserCheck, IconArrowRight, IconBookmark, IconX, IconEye, IconEyeOff, IconDownload } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Monologue } from "@/types/actor";
import RecentSearches from "@/components/search/RecentSearches";
import BookmarksQuickAccess from "@/components/bookmarks/BookmarksQuickAccess";

interface ProfileStats {
  completion_percentage: number;
  has_headshot: boolean;
  preferred_genres_count: number;
  profile_bias_enabled: boolean;
}

interface ActorProfile {
  name?: string | null;
  headshot_url?: string | null;
}

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
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [profile, setProfile] = useState<ActorProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [recommendations, setRecommendations] = useState<Monologue[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(true);
  const [headshotFailed, setHeadshotFailed] = useState(false);
  const [selectedMonologue, setSelectedMonologue] = useState<Monologue | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [profile?.headshot_url]);

  const fetchStats = async () => {
    try {
      const response = await api.get<ProfileStats>("/api/profile/stats");
      setStats(response.data);
    } catch (error: unknown) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await api.get<ActorProfile>("/api/profile");
      setProfile(response.data);
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      if (err.response?.status !== 404) {
        console.error("Failed to fetch profile:", error);
      }
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const fetchRecommendations = useCallback(async () => {
    try {
      const response = await api.get<Monologue[]>("/api/monologues/recommendations?limit=4");
      setRecommendations(response.data);
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      // 400 means profile not found/incomplete - this is expected
      if (err.response?.status !== 400) {
        console.error("Failed to fetch recommendations:", error);
      }
    } finally {
      setIsLoadingRecommendations(false);
    }
  }, []);

  useEffect(() => {
    // Fetch recommendations only if profile is complete enough
    if (!isLoadingStats && stats && stats.completion_percentage >= 50) {
      fetchRecommendations();
    } else if (!isLoadingStats) {
      setIsLoadingRecommendations(false);
    }
  }, [stats, isLoadingStats, fetchRecommendations]);

  const headshotUrl = profile?.headshot_url ? cleanImageUrl(profile.headshot_url) : null;
  const displayName = profile?.name || user?.name || user?.email || "Actor";
  const isProfileComplete = stats && stats.completion_percentage >= 50;

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
    try {
      if (mono.is_favorited) {
        await api.delete(`/api/monologues/${mono.id}/favorite`);
        setRecommendations(recommendations.map(m => m.id === mono.id ? { ...m, is_favorited: false, favorite_count: m.favorite_count - 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: false, favorite_count: selectedMonologue.favorite_count - 1 });
        }
      } else {
        await api.post(`/api/monologues/${mono.id}/favorite`);
        setRecommendations(recommendations.map(m => m.id === mono.id ? { ...m, is_favorited: true, favorite_count: m.favorite_count + 1 } : m));
        if (selectedMonologue?.id === mono.id) {
          setSelectedMonologue({ ...selectedMonologue, is_favorited: true, favorite_count: selectedMonologue.favorite_count + 1 });
        }
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
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
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl lg:text-4xl font-bold mb-1">
          Welcome back, {profile?.name?.split(' ')[0] || 'Actor'}
        </h1>
        <p className="text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content - Full Width Recommendations */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconSparkles className="h-5 w-5 text-primary" />
                  Recommended for you
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingRecommendations ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : !isProfileComplete ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                      <IconUserCheck className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      Complete your profile to get better recommendations
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Add your preferences, experience level, and other details to receive personalized monologue recommendations tailored to your profile.
                    </p>
                    <Button asChild>
                      <Link href="/profile">
                        Complete Profile
                        <IconArrowRight className="h-4 w-4 ml-2" />
                      </Link>
                    </Button>
                          </div>
                ) : recommendations.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {recommendations.map((mono, idx) => (
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
                                "{mono.text.substring(0, 120)}..."
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
                ) : (
                  <div className="text-center py-8">
                    <IconSparkles className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      No recommendations available at the moment
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

          {/* Recent Searches */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6"
          >
            <RecentSearches maxSearches={3} />
          </motion.div>
        </div>

        {/* Sidebar - Profile Card */}
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Avatar */}
                  <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                    {headshotFailed || !headshotUrl ? (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-muted">
                        <span className="text-2xl font-bold">
                          {getInitials(displayName)}
                        </span>
                      </div>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={headshotUrl}
                        alt="Headshot"
                        className="h-full w-full object-cover"
                        onError={() => setHeadshotFailed(true)}
                      />
                    )}
                  </div>

                  <div className="space-y-1 w-full">
                    <h3 className="font-semibold text-lg truncate">
                      {isLoadingProfile ? "Loading…" : displayName}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </p>
                  </div>

                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/profile">Edit Profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Bookmarks Quick Access */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
          >
            <BookmarksQuickAccess />
          </motion.div>
        </div>
      </div>

      {/* Slide-over Detail Panel */}
      <AnimatePresence>
        {selectedMonologue && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isReadingMode ? 0.95 : 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeMonologue}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className={`fixed inset-0 z-40 ${
                isReadingMode ? "bg-black/95" : "bg-black/50"
              }`}
            />

            {/* Slide-over Panel */}
          <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={`fixed right-0 top-0 bottom-0 z-50 overflow-y-auto transition-all ${
                isReadingMode
                  ? "w-full bg-background"
                  : "w-full md:w-[600px] lg:w-[700px] bg-background border-l shadow-2xl"
              }`}
            >
              <div className={`sticky top-0 bg-background/95 backdrop-blur-sm border-b z-10 ${
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
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDownloadMenu(false);
                            }}
                          />
                          <div className="absolute right-0 top-full mt-1 bg-background border rounded-lg shadow-lg p-1 min-w-[140px] z-50">
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
                          toggleFavorite(e as any, selectedMonologue);
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
