"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { useAuth } from "@/lib/auth";
import { useRehearseStats } from "@/hooks/useRehearseStats";
import { useRehearseSessions } from "@/hooks/useRehearseSessions";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { StatCards } from "@/components/progress/StatCards";
import { RatingSparkline } from "@/components/progress/RatingSparkline";
import { AreasToWorkOn } from "@/components/progress/AreasToWorkOn";
import { RecentSessions } from "@/components/progress/RecentSessions";

/**
 * /progress — a snapshot of the actor's rehearsal practice: streaks, rating
 * trend, focus areas, and recent sessions.
 */
export default function ProgressPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    data: stats,
    isLoading: statsLoading,
    isFetched: statsFetched,
  } = useRehearseStats();
  const { data: sessions, isLoading: sessionsLoading } = useRehearseSessions(20);

  const hasStats = statsFetched || stats !== undefined;
  const isLoading =
    (authLoading && !user) || (statsLoading && !hasStats);

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        className="space-y-8 sm:space-y-10"
      >
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Your progress
        </h1>

        {isLoading ? (
          <LoadingState />
        ) : !user ? (
          <div className="py-20 text-center text-muted-foreground text-sm">
            Please sign in to see your progress.
          </div>
        ) : !stats || stats.total_sessions === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8 sm:space-y-10">
            <StatCards stats={stats} />

            {stats.rating_trend.length >= 2 && (
              <Card className="p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Rating trend
                </p>
                <div className="mt-3">
                  <RatingSparkline points={stats.rating_trend} />
                </div>
              </Card>
            )}

            <AreasToWorkOn areas={stats.top_areas_to_improve} />

            {sessionsLoading && !sessions ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <RecentSessions sessions={sessions ?? []} />
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <p className="text-lg font-semibold text-foreground">
        No rehearsals yet
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Run a scene and your streaks, ratings, and focus areas will show up here.
      </p>
      <div className="mt-6 flex justify-center">
        <Button asChild>
          <Link href="/rehearse">Start rehearsing</Link>
        </Button>
      </div>
    </Card>
  );
}
