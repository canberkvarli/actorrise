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
const BRAND = "#CB4B00";

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
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface SessionsResponse {
  sessions: SessionEntry[];
  total: number;
  page: number;
  limit: number;
}

interface Analytics {
  funnel: {
    total: number;
    completed: number;
    abandoned: number;
    in_progress: number;
    completion_rate: number | null;
  };
  avg_duration_seconds: number | null;
  avg_completed_duration_seconds: number | null;
  dropoff: { bucket: string; count: number }[];
  by_scene: {
    scene_title: string;
    play_title: string;
    total: number;
    completed: number;
    abandoned: number;
    in_progress: number;
    completion_rate: number | null;
    avg_duration_seconds: number | null;
  }[];
  by_user: {
    email: string;
    total: number;
    completed: number;
    abandoned: number;
    completion_rate: number | null;
    last_active: string | null;
  }[];
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
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "-";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
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

/** Sharp-cornered stat tile (non-interactive → no rounding). */
function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="text-3xl font-bold mt-1 tabular-nums"
        style={accent ? { color: BRAND } : undefined}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function FunnelBar({ f }: { f: Analytics["funnel"] }) {
  const total = Math.max(1, f.total);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="border border-border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Funnel</p>
        <p className="text-xs text-muted-foreground tabular-nums">{f.total} sessions</p>
      </div>
      <div className="flex h-3 w-full overflow-hidden">
        <div style={{ width: seg(f.completed), backgroundColor: BRAND }} title={`${f.completed} completed`} />
        <div className="bg-muted-foreground/30" style={{ width: seg(f.in_progress) }} title={`${f.in_progress} in progress`} />
        <div className="bg-red-400/70 dark:bg-red-500/50" style={{ width: seg(f.abandoned) }} title={`${f.abandoned} abandoned`} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5" style={{ backgroundColor: BRAND }} />
          {f.completed} completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-muted-foreground/30" />
          {f.in_progress} in progress
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 bg-red-400/70 dark:bg-red-500/50" />
          {f.abandoned} abandoned
        </span>
      </div>
    </div>
  );
}

function DropOff({ rows }: { rows: Analytics["dropoff"] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const totalAbandoned = rows.reduce((a, r) => a + r.count, 0);
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Where actors drop off</p>
        <p className="text-xs text-muted-foreground">
          {totalAbandoned} abandoned sessions, by how far they got
        </p>
      </div>
      {totalAbandoned === 0 ? (
        <p className="text-xs text-muted-foreground">No abandoned sessions in range.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.bucket} className="flex items-center gap-2 text-xs">
              <span className="w-36 shrink-0 text-muted-foreground">{r.bucket}</span>
              <div className="flex-1 bg-muted/40 h-4">
                <div
                  className="h-4 bg-red-400/70 dark:bg-red-500/50"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right tabular-nums">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompletionPill({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">-</span>;
  return (
    <span className="tabular-nums font-medium" style={{ color: rate >= 50 ? BRAND : undefined }}>
      {rate}%
    </span>
  );
}

function SceneTable({ rows }: { rows: Analytics["by_scene"] }) {
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">Scenes by engagement</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data in range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Scene</th>
                <th className="py-1.5 text-right font-medium">Sessions</th>
                <th className="py-1.5 text-right font-medium">Done</th>
                <th className="py-1.5 text-right font-medium">Compl.</th>
                <th className="py-1.5 text-right font-medium">Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-2 max-w-[220px]">
                    <p className="truncate font-medium text-foreground">{r.scene_title}</p>
                    <p className="truncate text-muted-foreground">{r.play_title}</p>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.total}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.completed}</td>
                  <td className="py-1.5 text-right"><CompletionPill rate={r.completion_rate} /></td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatDuration(r.avg_duration_seconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserTable({ rows }: { rows: Analytics["by_user"] }) {
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <p className="text-sm font-medium">Most active actors</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data in range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 text-left font-medium">Actor</th>
                <th className="py-1.5 text-right font-medium">Sessions</th>
                <th className="py-1.5 text-right font-medium">Done</th>
                <th className="py-1.5 text-right font-medium">Compl.</th>
                <th className="py-1.5 text-right font-medium">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-1.5 pr-2 max-w-[220px]">
                    <span className="truncate block text-foreground">{r.email}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.total}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.completed}</td>
                  <td className="py-1.5 text-right"><CompletionPill rate={r.completion_rate} /></td>
                  <td className="py-1.5 text-right text-muted-foreground whitespace-nowrap">
                    {timeAgo(r.last_active)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
    return <p className="py-3 text-sm text-muted-foreground">Loading lines...</p>;
  }

  const lines = data?.lines ?? [];

  return (
    <div className="py-3 space-y-3">
      {data?.overall_feedback && (
        <div className="border border-border/60 bg-muted/20 p-3 text-sm space-y-2">
          <p className="font-medium">AI Feedback</p>
          <p className="text-muted-foreground">{data.overall_feedback}</p>
          {data.strengths && data.strengths.length > 0 && (
            <div>
              <span className="text-xs font-medium text-green-600 dark:text-green-400">Strengths:</span>{" "}
              <span className="text-xs text-muted-foreground">{data.strengths.join(", ")}</span>
            </div>
          )}
          {data.areas_to_improve && data.areas_to_improve.length > 0 && (
            <div>
              <span className="text-xs font-medium text-orange-600 dark:text-orange-400">To improve:</span>{" "}
              <span className="text-xs text-muted-foreground">{data.areas_to_improve.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lines delivered yet.</p>
      ) : (
        <div className="space-y-1.5">
          {lines.map((l) => (
            <div
              key={l.id}
              className="border border-border/60 bg-muted/20 p-2.5 text-sm flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-start"
            >
              <span className="text-xs text-muted-foreground font-mono shrink-0 pt-0.5">#{l.delivery_order}</span>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-foreground break-words">{l.user_input}</p>
                {l.ai_response && <p className="text-muted-foreground italic break-words">{l.ai_response}</p>}
                {l.feedback && <p className="text-xs text-muted-foreground break-words">{l.feedback}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {l.emotion_detected && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{l.emotion_detected}</Badge>
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
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
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

  useEffect(() => {
    setOffset(0);
  }, [debouncedQ, statusFilter]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const analyticsQuery = useQuery({
    queryKey: ["admin-sessions-analytics"],
    queryFn: async () => {
      const res = await api.get<Analytics>("/api/admin/sessions/analytics");
      return res.data;
    },
    staleTime: 30_000,
  });
  const a = analyticsQuery.data;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-sessions", debouncedQ, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get<SessionsResponse>(`/api/admin/sessions?${params}`);
      return res.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const refreshAll = () => {
    refetch();
    analyticsQuery.refetch();
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="font-brand text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">ScenePartner Sessions</h1>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 min-h-[44px] sm:min-h-0 w-full sm:w-auto"
          onClick={refreshAll}
        >
          <IconRefresh className={`h-4 w-4 ${isFetching || analyticsQuery.isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Top metrics */}
      {a && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Completion rate"
              value={a.funnel.completion_rate != null ? `${a.funnel.completion_rate}%` : "-"}
              hint={`${a.funnel.completed} of ${a.funnel.completed + a.funnel.abandoned} ended`}
              accent
            />
            <Stat label="Total sessions" value={a.funnel.total.toLocaleString()} hint={`${a.funnel.in_progress} still active`} />
            <Stat label="Avg duration" value={formatDuration(a.avg_duration_seconds)} hint="all ended sessions" />
            <Stat
              label="Avg completed"
              value={formatDuration(a.avg_completed_duration_seconds)}
              hint="completed only"
            />
          </div>

          <FunnelBar f={a.funnel} />

          <div className="grid gap-3 lg:grid-cols-2">
            <DropOff rows={a.dropoff} />
            <SceneTable rows={a.by_scene} />
          </div>

          <UserTable rows={a.by_user} />
        </>
      )}
      {analyticsQuery.isLoading && (
        <p className="py-4 text-sm text-muted-foreground">Loading analytics…</p>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <CardTitle className="text-base sm:text-lg">All sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 md:p-6">
          <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                className="pl-9 w-full"
                placeholder="Filter by user email or scene title..."
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setOffset(0);
                setStatusFilter(e.target.value);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        <CardContent className="pt-6 p-3 sm:p-4 md:p-6">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Loading sessions...</p>
          ) : isError ? (
            <p className="py-8 text-center text-destructive">
              {(error as Error)?.message || "Failed to load sessions"}
            </p>
          ) : (
            <div className="space-y-3">
              {/* Mobile: stacked cards */}
              <div className="md:hidden space-y-2">
                {data?.sessions.map((s) => (
                  <div key={s.id} className="border border-border/60 bg-card">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                      className="w-full text-left p-3 min-h-[44px] flex flex-col gap-2 hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm break-words">{s.scene_title}</p>
                          <p className="text-xs text-muted-foreground break-words">{s.play_title}</p>
                        </div>
                        {expandedId === s.id ? (
                          <IconChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <IconChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline" className={statusColor(s.status)}>
                          {s.status.replace("_", " ")}
                        </Badge>
                        <span className="text-muted-foreground">
                          as <span className="font-medium text-foreground">{s.user_character}</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="break-all">{s.user_email || "unknown"}</span>
                        <span>·</span>
                        <span>
                          {s.total_lines_delivered} line{s.total_lines_delivered === 1 ? "" : "s"}
                          {s.lines_retried > 0 && ` (${s.lines_retried} retried)`}
                        </span>
                        <span>·</span>
                        <span>{Math.round(s.completion_percentage)}%</span>
                        <span>·</span>
                        <span>{formatDuration(s.duration_seconds)}</span>
                        <span>·</span>
                        <span>{timeAgo(s.started_at)}</span>
                      </div>
                    </button>
                    {expandedId === s.id && (
                      <div className="border-t border-border/60 bg-muted/10 px-3">
                        <ExpandableLines sessionId={s.id} />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Scene</th>
                      <th className="py-2 text-left font-medium">User</th>
                      <th className="py-2 text-left font-medium">Playing</th>
                      <th className="py-2 text-left font-medium">Status</th>
                      <th className="py-2 text-left font-medium">Lines</th>
                      <th className="py-2 text-left font-medium">Completion</th>
                      <th className="py-2 text-left font-medium">Duration</th>
                      <th className="py-2 text-left font-medium">When</th>
                      <th className="py-2 text-left font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.sessions.map((s) => (
                      <Fragment key={s.id}>
                        <tr
                          className="border-b border-border/60 hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        >
                          <td className="py-2 max-w-[200px]">
                            <p className="font-medium truncate">{s.scene_title}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.play_title}</p>
                          </td>
                          <td className="py-2">
                            <span className="text-xs text-muted-foreground">{s.user_email || "unknown"}</span>
                          </td>
                          <td className="py-2">
                            <span className="text-xs">
                              as <span className="font-medium">{s.user_character}</span>
                            </span>
                          </td>
                          <td className="py-2">
                            <Badge variant="outline" className={statusColor(s.status)}>
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
                          <td className="py-2 tabular-nums text-muted-foreground">
                            {Math.round(s.completion_percentage)}%
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {formatDuration(s.duration_seconds)}
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
                  <p className="text-xs text-muted-foreground text-center sm:text-left">
                    {pageStart}-{pageEnd} of {total}
                  </p>
                  <div className="flex gap-2 justify-center sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canPrev}
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                      className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canNext}
                      onClick={() => setOffset(offset + PAGE_SIZE)}
                      className="min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
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
