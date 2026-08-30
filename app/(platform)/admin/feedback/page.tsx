"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconRefresh, IconMessageReport } from "@tabler/icons-react";

import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FeedbackItem {
  id: number;
  context: string;
  rating: string;
  comment: string;
  scene_meta: Record<string, string> | null;
  user_email: string | null;
  created_at: string | null;
  read_at: string | null;
}

interface FeedbackResponse {
  items: FeedbackItem[];
  total: number;
  page: number;
  limit: number;
}

interface FeedbackSummary {
  unread: number;
  total_negative: number;
  by_context: { context: string; count: number }[];
  impressions_30d?: number;
  votes_30d?: number;
  response_rate_30d?: number | null;
}

const CONTEXT_LABELS: Record<string, string> = {
  search: "monologue search",
  film_tv_search: "film / tv search",
  script_source: "script source",
  scene_extraction: "scene extraction",
};

function contextLabel(ctx: string): string {
  return CONTEXT_LABELS[ctx] ?? ctx.replace(/_/g, " ");
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function AdminFeedbackPage() {
  const queryClient = useQueryClient();
  const [context, setContext] = useState<string>("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ["admin-feedback-summary"],
    queryFn: async () => {
      const res = await api.get<FeedbackSummary>("/api/admin/feedback/summary");
      return res.data;
    },
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ["admin-feedback", context, unreadOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ rating: "negative", with_comment: "true", limit: "100" });
      if (context) params.set("context", context);
      if (unreadOnly) params.set("unread_only", "true");
      const res = await api.get<FeedbackResponse>(`/api/admin/feedback?${params.toString()}`);
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    queryClient.invalidateQueries({ queryKey: ["admin-feedback-summary"] });
    queryClient.invalidateQueries({ queryKey: ["admin-feedback-badge"] });
  };

  const markRead = useMutation({
    mutationFn: async ({ id, read }: { id: number; read: boolean }) => {
      await api.post(`/api/admin/feedback/${id}/read?read=${read}`);
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post("/api/admin/feedback/read-all");
    },
    onSuccess: invalidate,
  });

  const summary = summaryQuery.data;
  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-brand text-2xl font-semibold flex items-center gap-2">
            <IconMessageReport className="h-6 w-6 text-primary" />
            Feedback
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Negative feedback with a written note. You also get an email the moment one lands.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllRead.mutate()}
          disabled={!summary?.unread || markAllRead.isPending}
          className="gap-2"
        >
          <IconCheck className="h-4 w-4" />
          Mark all read
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="border border-border/60 bg-card/40 p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Unread</p>
          <p className="mt-1 text-2xl font-semibold text-primary tabular-nums">
            {summary?.unread ?? "—"}
          </p>
        </div>
        <div className="border border-border/60 bg-card/40 p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Total with notes
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {summary?.total_negative ?? "—"}
          </p>
        </div>
        <div className="border border-border/60 bg-card/40 p-4">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Response rate 30d
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {summary?.response_rate_30d != null
              ? `${Math.round(summary.response_rate_30d * 100)}%`
              : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {summary
              ? `${summary.votes_30d ?? 0} of ${summary.impressions_30d ?? 0} shown`
              : ""}
          </p>
        </div>
        <div className="col-span-2 border border-border/60 bg-card/40 p-4 sm:col-span-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">By area</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(summary?.by_context ?? []).map((c) => (
              <span
                key={c.context}
                className="inline-flex items-center gap-1 border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {contextLabel(c.context)} · {c.count}
              </span>
            ))}
            {summary && summary.by_context.length === 0 && (
              <span className="text-sm text-muted-foreground">none yet</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setContext("")}
          className={[
            "px-2.5 py-1 text-xs rounded-md transition-colors",
            context === "" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50",
          ].join(" ")}
        >
          All areas
        </button>
        {(summary?.by_context ?? []).map((c) => (
          <button
            key={c.context}
            onClick={() => setContext(c.context)}
            className={[
              "px-2.5 py-1 text-xs rounded-md transition-colors",
              context === c.context ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50",
            ].join(" ")}
          >
            {contextLabel(c.context)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="accent-[#CB4B00]"
            />
            Unread only
          </label>
          <Button variant="ghost" size="sm" onClick={() => invalidate()} className="gap-1.5">
            <IconRefresh className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading feedback...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing here. {unreadOnly ? "No unread notes." : "No negative feedback with notes in this area."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const unread = !item.read_at;
            return (
              <div
                key={item.id}
                className={[
                  "border p-4 transition-colors",
                  unread ? "border-primary/40 bg-primary/[0.04]" : "border-border/50 bg-card/30",
                ].join(" ")}
              >
                <div className="flex items-start gap-3">
                  {unread && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="unread" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      “{item.comment}”
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="outline" className="rounded-none text-[10px] px-1.5 py-0">
                        {contextLabel(item.context)}
                      </Badge>
                      {item.scene_meta?.cat && (
                        <Badge variant="outline" className="rounded-none text-[10px] px-1.5 py-0">
                          {item.scene_meta.cat.replace(/_/g, " ")}
                        </Badge>
                      )}
                      <span>{item.user_email ?? "anonymous"}</span>
                      <span>·</span>
                      <span>{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                  <Button
                    variant={unread ? "outline" : "ghost"}
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs"
                    onClick={() => markRead.mutate({ id: item.id, read: unread })}
                    disabled={markRead.isPending}
                  >
                    <IconCheck className="h-3.5 w-3.5" />
                    {unread ? "Mark read" : "Read"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
