"use client";

import { useAuth } from "@/lib/auth";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { IconSearch, IconUser, IconSparkles, IconTrendingUp, IconClock } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";

interface ProfileStats {
  completion_percentage: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    fetchStats();
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
        className="mb-12"
      >
        <h1 className="text-5xl font-bold mb-2">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="text-lg text-muted-foreground font-mono">
          Your acting journey continues
        </p>
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content - Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Profile Completion Card */}
          {stats && stats.completion_percentage < 100 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="border border-primary/20 bg-primary/5 rounded-lg p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold font-mono flex items-center gap-2">
                    <IconSparkles className="h-5 w-5 text-primary" />
                    Complete Your Profile
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Get better monologue recommendations
                  </p>
                </div>
                <span className="text-3xl font-bold text-primary">
                  {stats.completion_percentage}%
                </span>
              </div>
              <Progress value={stats.completion_percentage} className="h-2 mb-4" />
              <Link href="/profile">
                <Button className="font-mono">
                  Complete Profile
                </Button>
              </Link>
            </motion.div>
          )}

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

          {/* Quick Tips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="border border-border rounded-lg p-6"
          >
            <h3 className="text-lg font-bold font-mono mb-4 flex items-center gap-2">
              <IconTrendingUp className="h-5 w-5 text-primary" />
              Tips for Success
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Complete your profile for personalized monologue recommendations</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Use AI-powered search to find monologues that match your profile</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>Filter by age range, gender, and genre to narrow your search</span>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Sidebar - Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="border border-border rounded-lg p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <IconUser className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold">{user?.name || user?.email || "Actor"}</h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {user?.email}
                </p>
              </div>
            </div>
            {stats && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profile</span>
                  <span className="font-medium">{stats.completion_percentage}%</span>
                </div>
                <Progress value={stats.completion_percentage} className="h-1" />
              </div>
            )}
            <Link href="/profile">
              <Button variant="outline" className="w-full mt-4 font-mono">
                Edit Profile
              </Button>
            </Link>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="border border-border rounded-lg p-6"
          >
            <h3 className="font-bold font-mono mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recent Searches</span>
                <span className="font-medium">{searchHistory.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Profile Status</span>
                <span className={`font-medium ${stats && stats.completion_percentage === 100 ? 'text-green-600' : 'text-yellow-600'}`}>
                  {stats && stats.completion_percentage === 100 ? 'Complete' : 'In Progress'}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
