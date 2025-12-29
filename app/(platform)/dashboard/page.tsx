"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Link from "next/link";
import { IconSearch, IconUser, IconSparkles, IconTrendingUp, IconPhoto, IconLoader2, IconArrowRight, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import api from "@/lib/api";
import { Monologue } from "@/types/actor";
import { MonologueCard } from "@/components/search/MonologueCard";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";

interface ProfileStats {
  completion_percentage: number;
  has_headshot: boolean;
  preferred_genres_count: number;
  profile_bias_enabled: boolean;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [recommendedMonologues, setRecommendedMonologues] = useState<Monologue[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(true);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRecommended();
    loadSearchHistory();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get("/api/profile/stats");
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchRecommended = async () => {
    try {
      const response = await api.get("/api/search/recommended?limit=3");
      setRecommendedMonologues(response.data.results);
    } catch (error) {
      console.error("Failed to fetch recommended:", error);
    } finally {
      setIsLoadingRecommended(false);
    }
  };

  const loadSearchHistory = () => {
    const history = localStorage.getItem("monologue_search_history");
    if (history) {
      setSearchHistory(JSON.parse(history).slice(0, 3));
    }
  };

  const StatCard = ({ title, value, icon: Icon, delay = 0, tooltip }: { title: string; value: string | number; icon: any; delay?: number; tooltip?: string }) => {
    const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });
    
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.4, delay }}
      >
        <Card className="border-2 hover:border-primary/50 transition-colors">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-sm text-muted-foreground">{title}</p>
                  {tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex items-center">
                          <IconInfoCircle className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-sm">{tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <TooltipProvider>
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold mb-2">
          Welcome back{user ? `, ${user.email.split("@")[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground text-lg">
          Your complete acting platform
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoadingStats ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Profile Completion"
              value={stats ? `${stats.completion_percentage}%` : "0%"}
              icon={IconUser}
              delay={0}
            />
            <StatCard
              title="Preferred Genres"
              value={stats?.preferred_genres_count || 0}
              icon={IconSparkles}
              delay={0.1}
            />
            <StatCard
              title="Headshot"
              value={stats?.has_headshot ? "Uploaded" : "Missing"}
              icon={IconPhoto}
              delay={0.2}
            />
            <StatCard
              title="Smart Recommendations"
              value={stats?.profile_bias_enabled ? "On" : "Off"}
              icon={IconSparkles}
              delay={0.3}
              tooltip="Uses your profile to find monologues that match your age, gender, experience level, and preferred genres"
            />
          </>
        )}
      </div>

      {/* Profile Progress */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconUser className="h-5 w-5" />
                Profile Progress
              </CardTitle>
              <CardDescription>
                Complete your profile to unlock better recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Completion</span>
                  <span className="text-sm font-bold">{stats.completion_percentage}%</span>
                </div>
                <Progress value={stats.completion_percentage} className="h-3" />
                {stats.completion_percentage < 100 && (
                  <Link href="/profile">
                    <Button variant="outline" size="sm" className="w-full mt-2">
                      Complete Profile
                      <IconArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Actions & Recent Searches */}
      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border-2 h-full">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Get started with ActorRise</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/profile">
                <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                  <Button variant="outline" className="w-full justify-start">
                    <IconUser className="mr-2 h-4 w-4" />
                    Complete Your Profile
                  </Button>
                </motion.div>
              </Link>
              <Link href="/search">
                <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                  <Button variant="outline" className="w-full justify-start">
                    <IconSearch className="mr-2 h-4 w-4" />
                    Find Monologues
                  </Button>
                </motion.div>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        {searchHistory.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <Card className="border-2 h-full">
              <CardHeader>
                <CardTitle>Recent Searches</CardTitle>
                <CardDescription>Your recent monologue searches</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {searchHistory.map((search, idx) => (
                    <Link key={idx} href={`/search?q=${encodeURIComponent(search)}`}>
                      <motion.div
                        whileHover={{ x: 4 }}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors cursor-pointer"
                      >
                        <span className="text-sm">{search}</span>
                        <IconArrowRight className="h-4 w-4 text-muted-foreground" />
                      </motion.div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>

      {/* Recommended Monologues */}
      {isLoadingRecommended ? (
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="grid md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="pt-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : recommendedMonologues.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <IconSparkles className="h-6 w-6 text-primary" />
                Recommended for You
              </h2>
              <p className="text-sm text-muted-foreground">
                Monologues matched to your profile
              </p>
            </div>
            <Link href="/search">
              <Button variant="outline">
                View All
                <IconArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {recommendedMonologues.map((monologue, index) => (
              <MonologueCard key={monologue.id} monologue={monologue} index={index} />
            ))}
          </div>
        </motion.div>
      ) : null}
    </div>
    </TooltipProvider>
  );
}
