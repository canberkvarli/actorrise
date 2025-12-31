"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { IconSearch, IconClock, IconCameraPlus } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";

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
  // If it's an email or single token, just take first 2 chars
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
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [headshotFailed, setHeadshotFailed] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchProfile();
    loadSearchHistory();
  }, []);

  useEffect(() => {
    // If the URL changes (or we load a profile), allow the headshot to try again.
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
      // 404: user might not have created a profile yet
      const err = error as { response?: { status?: number } };
      if (err.response?.status !== 404) {
        console.error("Failed to fetch profile:", error);
      }
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const loadSearchHistory = () => {
    const history = localStorage.getItem("monologue_search_history");
    if (history) {
      setSearchHistory(JSON.parse(history).slice(0, 3));
    }
  };

  return (
    <div className="container mx-auto px-8 py-12 max-w-7xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
        <p className="text-lg text-muted-foreground font-mono">
          Pick up where you left off
        </p>
      </motion.div>

      {/* Profile Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="border border-border rounded-lg p-8 mb-10"
      >
        {(() => {
          const headshotUrl = profile?.headshot_url ? cleanImageUrl(profile.headshot_url) : null;
          const displayName = profile?.name || user?.name || user?.email || "Actor";

          return (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    {/* Avatar / Headshot */}
                    <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
                      {headshotFailed || !headshotUrl ? (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-muted">
                          <span className="text-xl font-bold">
                            {getInitials(displayName)}
                          </span>
                        </div>
                      ) : (
                        // Use <img> to avoid Next remote image config pitfalls (remote domains not configured).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={headshotUrl}
                          alt="Headshot"
                          className="h-full w-full object-cover"
                          onError={() => setHeadshotFailed(true)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-3xl font-bold truncate">
                      {isLoadingProfile ? "Loading…" : displayName}
                    </h2>
                  </div>
                </div>

                <div className="flex-1" />

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild variant="outline" className="font-mono w-full sm:w-auto">
                    <Link href="/profile">Edit Profile</Link>
                  </Button>
                  <Button asChild className="font-mono w-full sm:w-auto">
                    <Link href="/search">
                      <IconSearch className="h-4 w-4 mr-2" />
                      Search Monologues
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="border border-border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground font-mono">Profile completion</span>
                    <span className="text-sm font-semibold">
                      {!isLoadingStats && stats ? `${stats.completion_percentage}%` : "—"}
                    </span>
                  </div>
                  <Progress
                    value={!isLoadingStats && stats ? stats.completion_percentage : 0}
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {!isLoadingStats && stats && stats.completion_percentage === 100
                      ? "Profile complete."
                      : "Complete your profile for better recommendations"}
                  </p>
                </div>

                <div className="border border-border rounded-lg p-4 bg-muted/30 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Headshot</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {headshotUrl ? "Looking sharp." : "Add a professional headshot to your profile."}
                    </p>
                  </div>
                  {!headshotUrl && (
                    <Button asChild variant="outline" size="sm" className="font-mono">
                      <Link href="/profile">
                        <IconCameraPlus className="h-4 w-4 mr-2" />
                        Upload
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content - Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Search Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Link href="/search">
              <div className="group border border-border rounded-lg p-8 hover:border-primary/50 transition-all cursor-pointer hover:shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-3xl font-bold font-mono group-hover:text-primary transition-colors mb-2">
                      MonologueMatch
                    </h2>
                    <p className="text-muted-foreground font-mono">
                      Find your perfect monologue with AI-powered search
                    </p>
                  </div>
                  <IconSearch className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
                {searchHistory.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <IconClock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground font-mono">Recent searches:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {searchHistory.map((item, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-3 py-1 rounded-md bg-muted text-muted-foreground font-mono"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          </motion.div>
        </div>

        {/* Sidebar - Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Sidebar intentionally left lighter now that Profile is the hero */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 }}
            className="border border-border rounded-lg p-6"
          >
            <h3 className="font-bold font-mono mb-2">Recent Searches</h3>
            {searchHistory.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((item, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-3 py-1 rounded-md bg-muted text-muted-foreground font-mono"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recent searches yet — try MonologueMatch to find your next piece.
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
