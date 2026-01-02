"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { IconSearch, IconBookmark, IconSparkles, IconTrendingUp, IconClock } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import { Monologue } from "@/types/actor";

interface ProfileStats {
  completion_percentage: number;
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
  const [bookmarkedMonologues, setBookmarkedMonologues] = useState<Monologue[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(true);
  const [headshotFailed, setHeadshotFailed] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchProfile();
    fetchBookmarkedMonologues();
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

  const fetchBookmarkedMonologues = async () => {
    try {
      const response = await api.get<Monologue[]>("/api/monologues/favorites/my");
      setBookmarkedMonologues(response.data.slice(0, 3)); // Show top 3
    } catch (error: unknown) {
      console.error("Failed to fetch bookmarked monologues:", error);
    } finally {
      setIsLoadingBookmarks(false);
    }
  };

  const headshotUrl = profile?.headshot_url ? cleanImageUrl(profile.headshot_url) : null;
  const displayName = profile?.name || user?.name || user?.email || "Actor";

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
        {/* Main Content - Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid sm:grid-cols-2 gap-4"
          >
            <Link href="/search">
              <Card className="group hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <IconSearch className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                        Search Monologues
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        AI-powered semantic search
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/bookmarks">
              <Card className="group hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                      <IconBookmark className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1 group-hover:text-accent transition-colors">
                        My Bookmarks
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {bookmarkedMonologues.length} saved monologues
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>

          {/* Bookmarked Monologues */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconBookmark className="h-5 w-5 text-accent" />
                  Recently Bookmarked
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingBookmarks ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : bookmarkedMonologues.length > 0 ? (
                  <div className="space-y-3">
                    {bookmarkedMonologues.map((mono) => (
                      <Link key={mono.id} href={`/search`}>
                        <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer border">
                          <div className="flex-shrink-0 p-2 rounded-md bg-accent/10">
                            <IconSparkles className="h-4 w-4 text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate">
                              {mono.character_name}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">
                              {mono.play_title} • {mono.author}
                            </p>
                            <div className="flex gap-1.5 mt-1">
                              {mono.primary_emotion && (
                                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                  {mono.primary_emotion}
                                </span>
                              )}
                              {mono.character_gender && (
                                <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full capitalize">
                                  {mono.character_gender}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-xs text-muted-foreground">
                            {Math.floor(mono.estimated_duration_seconds / 60)}m
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <IconBookmark className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-2">
                      No bookmarked monologues yet
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/search">
                        <IconSearch className="h-4 w-4 mr-2" />
                        Find Monologues
                      </Link>
                    </Button>
                  </div>
                )}
                {bookmarkedMonologues.length > 0 && (
                  <Button asChild variant="ghost" size="sm" className="w-full mt-3">
                    <Link href="/bookmarks">View all bookmarks →</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Sidebar - Right Column (1/3) */}
        <div className="space-y-6">
          {/* Profile Card */}
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
                    <p className="text-xs text-muted-foreground">
                      {user?.email}
                    </p>
                  </div>

                  {/* Profile Completion */}
                  <div className="w-full space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Profile completion</span>
                      <span className="font-semibold">
                        {!isLoadingStats && stats ? `${stats.completion_percentage}%` : "—"}
                      </span>
                    </div>
                    <Progress
                      value={!isLoadingStats && stats ? stats.completion_percentage : 0}
                      className="h-2"
                    />
                  </div>

                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href="/profile">Edit Profile</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <IconTrendingUp className="h-4 w-4" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bookmarked</span>
                  <span className="text-lg font-semibold">{bookmarkedMonologues.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Profile</span>
                  <span className="text-lg font-semibold">
                    {!isLoadingStats && stats ? `${stats.completion_percentage}%` : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
