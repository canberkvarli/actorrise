"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  IconSearch,
  IconRefresh,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";

import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 25;

interface SessionEntry {
  id: number;
  user_email: string | null;
  scene_title: string;
  play_title: string;
  character_1: string | null;
  character_2: string | null;
  user_character: string;
  ai_character: string;
  status: string;
  total_lines_delivered: number;
  lines_retried: number;
  completion_percentage: number;
  overall_rating: number | null;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface SessionsResponse {
  sessions: SessionEntry[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total_sessions: number;
    completed: number;
    abandoned: number;
    in_progress: number;
    avg_duration_seconds: number | null;
    avg_rating: number | null;
    avg_completion: number | null;
    top_scenes: { scene: string; count: number }[];
  };
}

interface LineDelivery {
  id: number;
  delivery_order: number;
  user_input: string;
  ai_response: string | null;
  feedback: string | null;
  emotion_detected: string | null;
  pacing_feedback: string | null;
  was_retry: boolean;
  delivered_at: string | null;
}

interface SessionLinesResponse {
  overall_feedback: string | null;
  strengths: string[] | null;
  areas_to_improve: string[] | null;
  lines: LineDelivery[];
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0
    ? `${mins}m ${secs}s`
    : `${secs}s`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "-";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function statusColor(status: string): string {
  if (status === "completed")
    return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  if (status === "abandoned")
    return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
  return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
}

function pacingColor(pacing: string | null): string {
  if (pacing === "good") return "text-green-600 dark:text-green-400";
  if (pacing === "too_fast") return "text-orange-600 dark:text-orange-400";
  if (pacing === "too_slow") return "text-yellow-600 dark:text-yellow-400";
  return "text-muted-foreground";
}

function ExpandableLines({ sessionId }: { sessionId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-session-lines", sessionId],
    queryFn: async () => {
      const res = await api.get<SessionLinesResponse>(
        `/api/admin/sessions/${sessionId}/lines`
      );
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <p className="py-3 text-sm text-muted-foreground">Loading lines...</p>
    );
  }

  const lines = data?.lines ?? [];

  return (
    <div className="py-3 space-y-3">
      {/* Feedback summary */}
      {data?.overall_feedback && (
        <div className="border border-border/60 bg-muted/20 p-3 text-sm space-y-2">
          <p className="font-medium">AI Feedback</p>
          <p className="text-muted-foreground">{data.overall_feedback}</p>
          {data.strengths && data.strengths.length > 0 && (
            <div>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Strengths:
              </span>{" "}
              <span className="text-xs text-muted-foreground">
                {data.strengths.join(", ")}
              </span>
            </div>
          )}
          {data.areas_to_improve && data.areas_to_improve.length > 0 && (
            <div>
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                To improve:
              </span>{" "}
              <span className="text-xs text-muted-foreground">
                {data.areas_to_improve.join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Line deliveries */}
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lines delivered yet.</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((l) => (
            <div
              key={l.id}
              className="border border-border/60 bg-muted/20 p-2.5 text-sm flex gap-3 items-start"
            >
              <span className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5">
                #{l.delivery_order}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-foreground">{l.user_input}</p>
                {l.ai_response && (
                  <p className="text-muted-foreground italic">
                    {l.ai_response}
                  </p>
                )}
                {l.feedback && (
                  <p className="text-xs text-muted-foreground">
                    {l.feedback}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {l.emotion_detected && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {l.emotion_detected}
                  </Badge>
                )}
                {l.pacing_feedback && (
                  <span className={`text-[10px] ${pacingColor(l.pacing_feedback)}`}>
                    {l.pacing_feedback.replace("_", " ")}
                  </span>
                )}
                {l.was_retry && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800"
                  >
                    retry
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    timer.current = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer.current);
  }, [value, delay]);
  return debounced;
}

export default function AdminSessionsPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q, 400);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-sessions", debouncedQ, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get<SessionsResponse>(
        `/api/admin/sessions?${params}`
      );
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const summary = data?.summary;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Sessions</p>
              <p className="text-2xl font-bold">
                {summary.total_sessions.toLocaleString()}
              </p>
              <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                <span className="text-green-600 dark:text-green-400">
                  {summary.completed} completed
                </span>
                <span className="text-red-600 dark:text-red-400">
                  {summary.abandoned} abandoned
                </span>
                <span className="text-blue-600 dark:text-blue-400">
                  {summary.in_progress} active
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Avg Duration</p>
              <p className="text-2xl font-bold">
                {formatDuration(summary.avg_duration_seconds)}
              </p>
              {summary.avg_completion != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.avg_completion}% avg completion
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Avg Rating</p>
              <p className="text-2xl font-bold">
                {summary.avg_rating != null
                  ? `${summary.avg_rating}/5`
                  : "-"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium mb-2">Top Scenes</p>
              {summary.top_scenes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet</p>
              ) : (
                <div className="space-y-1">
                  {summary.top_scenes.map((ts, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate mr-2">{ts.scene}</span>
                      <span className="text-muted-foreground shrink-0">
                        {ts.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">ScenePartner Sessions</CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
          >
            <IconRefresh
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                className="pl-9"
                placeholder="Filter by user email or scene title..."
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setOffset(0);
                setStatusFilter(e.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">
              Loading sessions...
            </p>
          ) : isError ? (
            <p className="py-8 text-center text-destructive">
              {(error as Error)?.message || "Failed to load sessions"}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Scene</th>
                      <th className="py-2 text-left font-medium">User</th>
                      <th className="py-2 text-left font-medium">Playing</th>
                      <th className="py-2 text-left font-medium">Status</th>
                      <th className="py-2 text-left font-medium">Lines</th>
                      <th className="py-2 text-left font-medium">Duration</th>
                      <th className="py-2 text-left font-medium">Rating</th>
                      <th className="py-2 text-left font-medium">When</th>
                      <th className="py-2 text-left font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.sessions.map((s) => (
                      <Fragment key={s.id}>
                        <tr
                          className="border-b border-border/60 hover:bg-muted/30 cursor-pointer"
                          onClick={() =>
                            setExpandedId(
                              expandedId === s.id ? null : s.id
                            )
                          }
                        >
                          <td className="py-2 max-w-[200px]">
                            <p className="font-medium truncate">
                              {s.scene_title}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {s.play_title}
                            </p>
                          </td>
                          <td className="py-2">
                            <span className="text-xs text-muted-foreground">
                              {s.user_email || "unknown"}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className="text-xs">
                              as{" "}
                              <span className="font-medium">
                                {s.user_character}
                              </span>
                            </span>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant="outline"
                              className={statusColor(s.status)}
                            >
                              {s.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="py-2">
                            <span>{s.total_lines_delivered}</span>
                            {s.lines_retried > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({s.lines_retried} retried)
                              </span>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {formatDuration(s.duration_seconds)}
                          </td>
                          <td className="py-2">
                            {s.overall_rating != null ? (
                              <span className="font-medium">
                                {s.overall_rating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {timeAgo(s.started_at)}
                          </td>
                          <td className="py-2">
                            {expandedId === s.id ? (
                              <IconChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <IconChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                        </tr>
                        {expandedId === s.id && (
                          <tr key={`${s.id}-lines`}>
                            <td colSpan={9} className="bg-muted/10 px-4">
                              <ExpandableLines sessionId={s.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > 0 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">
                    {pageStart}-{pageEnd} of {total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canPrev}
                      onClick={() =>
                        setOffset(Math.max(0, offset - PAGE_SIZE))
                      }
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canNext}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
