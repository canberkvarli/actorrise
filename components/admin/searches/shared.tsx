"use client";

/**
 * Shared vocabulary for the admin search screens.
 *
 * Search is the busiest thing on the platform, so its admin views get split by
 * the question being asked (what's broken / what do they want / who is this /
 * what just happened) rather than by which columns the API happens to return.
 * Everything those views have in common lives here.
 */

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";

export const BRAND = "#CB4B00";

/** A single logged search. */
export interface SearchLogEntry {
  id: number;
  query: string;
  filters_used: Record<string, string> | null;
  results_count: number;
  result_ids: number[] | null;
  user_email: string | null;
  source: string;
  weak_match: boolean | null;
  best_cosine: number | null;
  match_strategy: string | null;
  query_type: string | null;
  /** jsonb on the backend — object when a real gap, jsonb `null` otherwise. */
  content_gap: unknown;
  is_repeat: boolean | null;
  created_at: string;
}

export interface MonologueSnapshot {
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

export interface SearchSummary {
  total_searches: number;
  zero_result_count: number;
  weak_match_count: number;
  weak_match_rate: number;
  scoreable_count?: number;
  title_lookup_count?: number;
  content_gap_count: number;
  avg_best_cosine: number | null;
  by_match_strategy: { key: string; count: number }[];
  by_query_type: { key: string; count: number }[];
  retry_events: number;
  retry_users: number;
  repeat_count?: number;
  repeat_rate?: number;
  top_queries: { query: string; count: number }[];
  top_zero_result_queries: { query: string; count: number }[];
  top_weak_queries?: { query: string; count: number; avg_cosine: number | null }[];
}

export interface SearchesResponse {
  searches: SearchLogEntry[];
  total: number;
  page: number;
  limit: number;
  summary: SearchSummary | null;
}

export interface SearchUserRow {
  user_id: number;
  email: string | null;
  searches: number;
  zero_results: number;
  weak_matches: number;
  /** zero OR weak, counted once. zero_results + weak_matches double-counts
   *  the rows that are both, which showed as "120.0% went badly". */
  bad_searches: number;
  repeats: number;
  distinct_queries: number;
  avg_best_cosine: number | null;
  last_seen: string | null;
  first_seen: string | null;
}

export interface ContentRequestItem {
  id: number;
  play_title: string;
  author: string | null;
  character_name: string | null;
  request_count: number;
  first_requested_at: string;
  last_requested_at: string;
  status: string;
}

/** Which kind of failure a view is filtered to. `null` = everything. */
export type ProblemFilter = "zero" | "weak" | "gap" | "repeat" | "any" | null;

export interface LogFilters {
  q: string;
  source: string;
  problem: ProblemFilter;
  user: string;
}

export const EMPTY_FILTERS: LogFilters = { q: "", source: "all", problem: null, user: "" };

// ── formatting ────────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 60) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export function share(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

// ── data hooks ────────────────────────────────────────────────────────────────

/**
 * The summary aggregates, fetched on their own rather than piggybacking on
 * page 1 of the log feed — so every tab reads the same cached copy and
 * paginating the table never blanks the headline numbers.
 */
export function useSearchSummary() {
  return useQuery({
    queryKey: ["admin-search-summary"],
    queryFn: async () => {
      const res = await api.get<SearchSummary>("/api/admin/searches/summary");
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useSearchUsers() {
  return useQuery({
    queryKey: ["admin-search-users"],
    queryFn: async () => {
      const res = await api.get<{ users: SearchUserRow[]; anonymous_searches: number }>(
        "/api/admin/searches/by-user"
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}

// ── primitives ────────────────────────────────────────────────────────────────

/**
 * A headline number with a plain-English caption. Pass `onClick` to make it a
 * filter switch — the tile then reads as "click me to see these rows".
 */
export function StatTile({
  label,
  value,
  caption,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "alert" | "good";
  active?: boolean;
  onClick?: () => void;
}) {
  const color = tone === "alert" ? BRAND : undefined;
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums leading-none" style={{ color }}>
        {value}
      </p>
      {caption && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{caption}</p>}
    </>
  );

  if (!onClick) {
    return <div className="border border-border bg-card px-3 py-3">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border px-3 py-3 text-left transition-colors ${
        active ? "bg-muted/60" : "bg-card hover:bg-muted/30"
      }`}
      style={{ borderColor: active ? BRAND : undefined }}
    >
      {body}
      <span className="mt-1.5 block text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {active ? "showing these" : "click to see them"}
      </span>
    </button>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const label = source === "film_tv" ? "Film/TV" : source === "search" ? "Plays" : source;
  const cls =
    source === "demo"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : source === "film_tv"
        ? "bg-purple-50 text-purple-700 border-purple-200"
        : "";
  return (
    <Badge variant="outline" className={`rounded-none ${cls}`}>
      {label}
    </Badge>
  );
}

/** The at-a-glance verdict on one search, in words rather than jargon. */
export function ProblemFlags({ entry }: { entry: SearchLogEntry }) {
  const flags: string[] = [];
  if (entry.results_count === 0) flags.push("nothing found");
  else if (entry.weak_match) flags.push("poor match");
  if (entry.content_gap && typeof entry.content_gap === "object") flags.push("we don't have it");
  if (entry.is_repeat) flags.push("tried again");

  if (flags.length === 0) {
    return <span className="text-xs text-muted-foreground">looks fine</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-xs font-medium" style={{ color: BRAND }}>
      {flags.map((f) => (
        <span key={f}>{f}</span>
      ))}
    </span>
  );
}

/**
 * Ranked queries as proportional bars. Reading a top-10 list as bars makes the
 * shape of demand obvious in a way a column of numbers never does.
 */
export function QueryBarList({
  items,
  emptyLabel,
  action,
  onSelect,
}: {
  items: { query: string; count: number; caption?: string }[];
  emptyLabel: string;
  action?: { label: string; onClick: (query: string) => void; busyQuery?: string | null };
  onSelect?: (query: string) => void;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.query} className="group">
          <div className="flex items-baseline justify-between gap-3">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.query)}
                className="truncate text-left text-sm hover:underline"
                title={`See every log row for “${item.query}”`}
              >
                {item.query}
              </button>
            ) : (
              <span className="truncate text-sm">{item.query}</span>
            )}
            <span className="flex shrink-0 items-baseline gap-2">
              {item.caption && (
                <span className="text-[11px] tabular-nums text-muted-foreground">{item.caption}</span>
              )}
              <span className="text-sm font-semibold tabular-nums">{item.count}</span>
              {action && (
                <button
                  type="button"
                  onClick={() => action.onClick(item.query)}
                  disabled={action.busyQuery === item.query}
                  className="text-[11px] uppercase tracking-wide text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
                  style={{ color: BRAND }}
                >
                  {action.busyQuery === item.query ? "…" : action.label}
                </button>
              )}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full bg-muted/50">
            <div
              className="h-1.5"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: BRAND }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Section wrapper — sharp-cornered card with a title and optional subtitle. */
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-border bg-card p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
