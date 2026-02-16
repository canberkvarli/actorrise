"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCheck, IconClock, IconX, IconSparkles, IconExternalLink } from "@tabler/icons-react";
import api from "@/lib/api";
import { motion } from "framer-motion";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

interface Submission {
  id: number;
  title: string;
  status: "pending" | "ai_review" | "manual_review" | "approved" | "rejected";
  submitted_at: string;
  processed_at: string | null;
  rejection_reason: string | null;
  rejection_details: string | null;
  monologue_id: number | null;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    icon: IconClock,
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  ai_review: {
    label: "AI Review",
    icon: IconSparkles,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  manual_review: {
    label: "Under Review",
    icon: IconClock,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    icon: IconCheck,
    color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  rejected: {
    label: "Rejected",
    icon: IconX,
    color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

export default function MySubmissionsPage() {
  const { data: submissions = [], isLoading, refetch } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: async () => {
      const response = await api.get<Submission[]>("/api/monologues/my-submissions");
      return response.data;
    },
    staleTime: 0, // Always refetch when visiting so new submissions show up
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: Submission["status"]) => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto px-4 lg:px-8 py-8 max-w-6xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">My Submissions</h1>
            <p className="text-muted-foreground">
              Track the status of your submitted monologues
            </p>
          </div>
          <Button asChild>
            <Link href="/submit-monologue">
              <IconSparkles className="h-4 w-4 mr-2" />
              Submit New
            </Link>
          </Button>
        </div>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Submission History ({submissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : submissions.length > 0 ? (
              <div className="space-y-4">
                {submissions.map((submission, idx) => (
                  <motion.div
                    key={submission.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            {/* Title and Status */}
                            <div className="flex items-start gap-3">
                              <div className="flex-1">
                                <h3 className="font-semibold text-lg mb-1">
                                  {submission.title}
                                </h3>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getStatusBadge(submission.status)}
                                  <span className="text-sm text-muted-foreground">
                                    Submitted {formatDate(submission.submitted_at)}
                                  </span>
                                </div>
                              </div>

                              {/* Action Button */}
                              {submission.status === "approved" && submission.monologue_id && (
                                <Button size="sm" variant="outline" asChild>
                                  <Link href={`/monologue/${submission.monologue_id}`}>
                                    <IconExternalLink className="h-4 w-4 mr-2" />
                                    View
                                  </Link>
                                </Button>
                              )}
                            </div>

                            {/* Status Details */}
                            {submission.status === "manual_review" && (
                              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
                                <p className="text-sm text-amber-900 dark:text-amber-100">
                                  <strong>Under Review:</strong> A moderator is reviewing your submission. You'll receive an email when a decision is made (typically within 24-48 hours).
                                </p>
                              </div>
                            )}

                            {submission.status === "rejected" && (
                              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                                <p className="text-sm text-red-900 dark:text-red-100">
                                  <strong>Reason:</strong> {submission.rejection_reason || "Not specified"}
                                </p>
                                {submission.rejection_details && (
                                  <p className="text-sm text-red-900 dark:text-red-100 mt-1">
                                    {submission.rejection_details}
                                  </p>
                                )}
                              </div>
                            )}

                            {submission.status === "approved" && (
                              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                                <p className="text-sm text-green-900 dark:text-green-100">
                                  <strong>Approved!</strong> Your monologue is now live and searchable by all ActorRise users.
                                  {submission.processed_at && (
                                    <span className="ml-1">
                                      (Processed {formatDate(submission.processed_at)})
                                    </span>
                                  )}
                                </p>
                              </div>
                            )}

                            {(submission.status === "pending" || submission.status === "ai_review") && (
                              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                <p className="text-sm text-blue-900 dark:text-blue-100">
                                  <strong>Processing:</strong> Your submission is being analyzed. You'll receive an email notification shortly.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <IconSparkles className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                <h3 className="text-lg font-semibold mb-2">No submissions yet</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  Share your favorite monologues with the ActorRise community. Submit your first monologue to get started!
                </p>
                <Button asChild>
                  <Link href="/submit-monologue">
                    <IconSparkles className="h-4 w-4 mr-2" />
                    Submit a Monologue
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
