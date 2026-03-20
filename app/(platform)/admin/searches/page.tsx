"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconSearch, IconRefresh, IconChevronDown, IconChevronUp } from "@tabler/icons-react";

import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 25;

interface SearchLogEntry {
  id: number;
  query: string;
  filters_used: Record<string, string> | null;
  results_count: number;
  result_ids: number[] | null;
  user_email: string | null;
  source: string;
  created_at: string;
}

interface MonologueSnapshot {
  id: number;
  title: string;
  character_name: string;
  gender: string | null;
  age_range: string | null;
  emotion: string | null;
  duration_seconds: number;
  word_count: number;
  play_title: string;
  author: string;
}

interface SearchesResponse {
  searches: SearchLogEntry[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total_searches: number;
    zero_result_count: number;
    top_queries: { query: string; count: number }[];
    top_zero_result_queries: { query: string; count: number }[];
  };
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `0:${String(secs).padStart(2, "0")}`;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function ExpandableResults({ logId }: { logId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-search-results", logId],
    queryFn: async () => {
      const res = await api.get<{ monologues: MonologueSnapshot[] }>(
        `/api/admin/searches/${logId}/results`
      );
      return res.data;
    },
  });

  if (isLoading) {
    return <p className="py-3 text-sm text-muted-foreground">Loading results...</p>;
  }

  const monologues = data?.monologues ?? [];
  if (monologues.length === 0) {
    return <p className="py-3 text-sm text-muted-foreground">No results returned.</p>;
  }

  return (
    <div className="grid gap-2 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {monologues.map((m) => (
        <div
          key={m.id}
          className="border border-border/60 bg-muted/20 p-3 text-sm space-y-1"
        >
          <p className="font-medium">{m.title}</p>
          <p className="text-xs text-muted-foreground">
            {m.character_name} in <span className="italic">{m.play_title}</span>
          </p>
          <p className="text-xs text-muted-foreground">by {m.author}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            {m.gender && m.gender !== "any" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.gender}</Badge>
            )}
            {m.age_range && m.age_range !== "any" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.age_range}</Badge>
            )}
            {m.emotion && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{m.emotion}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDuration(m.duration_seconds)} · {m.word_count}w
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminSearchesPage() {
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [zeroOnly, setZeroOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-searches", q, sourceFilter, zeroOnly, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (zeroOnly) params.set("zero_only", "true");
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get<SearchesResponse>(`/api/admin/searches?${params}`);
      return res.data;
    },
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
              <p className="text-sm text-muted-foreground">Total Searches</p>
              <p className="text-2xl font-bold">{summary.total_searches.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Zero Results</p>
              <p className="text-2xl font-bold text-destructive">
                {summary.zero_result_count.toLocaleString()}
              </p>
              {summary.total_searches > 0 && (
                <p className="text-xs text-muted-foreground">
                  {((summary.zero_result_count / summary.total_searches) * 100).toFixed(1)}% of searches
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium mb-2">Top Queries</p>
              {summary.top_queries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data yet</p>
              ) : (
                <div className="space-y-1">
                  {summary.top_queries.slice(0, 5).map((tq, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate mr-2">{tq.query}</span>
                      <span className="text-muted-foreground shrink-0">{tq.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm font-medium mb-2 text-destructive">Content Gaps</p>
              {summary.top_zero_result_queries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No zero-result queries</p>
              ) : (
                <div className="space-y-1">
                  {summary.top_zero_result_queries.slice(0, 5).map((tq, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="truncate mr-2">{tq.query}</span>
                      <span className="text-muted-foreground shrink-0">{tq.count}</span>
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
          <CardTitle className="text-base">Search Logs</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()}>
              <IconRefresh className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setOffset(0);
                  setQ(e.target.value);
                }}
                className="pl-9"
                placeholder="Filter by query text..."
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setOffset(0);
                setSourceFilter(e.target.value);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="all">All sources</option>
              <option value="search">Search (auth)</option>
              <option value="demo">Demo (landing)</option>
            </select>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={zeroOnly}
                onChange={(e) => {
                  setOffset(0);
                  setZeroOnly(e.target.checked);
                }}
                className="rounded border-input"
              />
              Zero results only
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="py-8 text-center text-muted-foreground">Loading searches...</p>
          ) : isError ? (
            <p className="py-8 text-center text-destructive">
              {(error as Error)?.message || "Failed to load searches"}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="py-2 text-left font-medium">Query</th>
                      <th className="py-2 text-left font-medium">User</th>
                      <th className="py-2 text-left font-medium">Filters</th>
                      <th className="py-2 text-left font-medium">Results</th>
                      <th className="py-2 text-left font-medium">Source</th>
                      <th className="py-2 text-left font-medium">When</th>
                      <th className="py-2 text-left font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.searches.map((entry) => (
                      <>
                        <tr
                          key={entry.id}
                          className="border-b border-border/60 hover:bg-muted/30 cursor-pointer"
                          onClick={() =>
                            setExpandedId(expandedId === entry.id ? null : entry.id)
                          }
                        >
                          <td className="py-2 max-w-[240px]">
                            <p className="font-medium truncate">{entry.query}</p>
                          </td>
                          <td className="py-2">
                            <span className="text-xs text-muted-foreground">
                              {entry.user_email || "anonymous"}
                            </span>
                          </td>
                          <td className="py-2">
                            {entry.filters_used && Object.keys(entry.filters_used).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(entry.filters_used).map(([k, v]) => (
                                  <Badge
                                    key={k}
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {k}: {String(v)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">none</span>
                            )}
                          </td>
                          <td className="py-2">
                            <span
                              className={
                                entry.results_count === 0
                                  ? "font-medium text-destructive"
                                  : ""
                              }
                            >
                              {entry.results_count}
                            </span>
                          </td>
                          <td className="py-2">
                            <Badge
                              variant="outline"
                              className={
                                entry.source === "demo"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : ""
                              }
                            >
                              {entry.source}
                            </Badge>
                          </td>
                          <td className="py-2 text-muted-foreground whitespace-nowrap">
                            {timeAgo(entry.created_at)}
                          </td>
                          <td className="py-2">
                            {expandedId === entry.id ? (
                              <IconChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <IconChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                        </tr>
                        {expandedId === entry.id && (
                          <tr key={`${entry.id}-results`}>
                            <td colSpan={7} className="bg-muted/10 px-4">
                              <ExpandableResults logId={entry.id} />
                            </td>
                          </tr>
                        )}
                      </>
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
                      onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
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
