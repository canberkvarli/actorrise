"use client";

import { Fragment, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconChevronDown, IconChevronUp, IconRefresh, IconSearch, IconX } from "@tabler/icons-react";

import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BRAND,
  EMPTY_FILTERS,
  formatDuration,
  ProblemFlags,
  SourceBadge,
  timeAgo,
  type LogFilters,
  type MonologueSnapshot,
  type SearchesResponse,
  type SearchLogEntry,
} from "./shared";

const PAGE_SIZE = 25;

const PROBLEM_LABELS: Record<string, string> = {
  any: "any problem",
  zero: "nothing found",
  weak: "poor match",
  gap: "we don't have it",
  repeat: "tried again",
};

/** The monologues a given search actually returned, fetched on expand. */
function ExpandedResults({ logId }: { logId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-search-results", logId],
    queryFn: async () => {
      const res = await api.get<{ monologues: MonologueSnapshot[] }>(
        `/api/admin/searches/${logId}/results`
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  if (isLoading) {
    return <p className="py-3 text-sm text-muted-foreground">Loading what they saw…</p>;
  }

  const monologues = data?.monologues ?? [];
  if (monologues.length === 0) {
    return (
      <p className="py-3 text-sm text-muted-foreground">
        They got an empty screen. Nothing came back for this one.
      </p>
    );
  }

  return (
    <div className="grid gap-2 py-3 sm:grid-cols-2 lg:grid-cols-3">
      {monologues.map((m) => (
        <div key={m.id} className="space-y-1 border border-border/60 bg-muted/20 p-3 text-sm">
          <p className="font-medium">{m.title}</p>
          <p className="text-xs text-muted-foreground">
            {m.character_name} in <span className="italic">{m.play_title}</span>
          </p>
          <p className="text-xs text-muted-foreground">by {m.author}</p>
          <div className="flex flex-wrap items-center gap-1 pt-1">
            {m.gender && m.gender !== "any" && (
              <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                {m.gender}
              </Badge>
            )}
            {m.age_range && m.age_range !== "any" && (
              <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                {m.age_range}
              </Badge>
            )}
            {m.emotion && (
              <Badge variant="outline" className="rounded-none px-1.5 py-0 text-[10px]">
                {m.emotion}
              </Badge>
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

/** Chips showing what the view is narrowed to, each individually removable. */
function ActiveFilterChips({
  filters,
  onChange,
}: {
  filters: LogFilters;
  onChange: (next: LogFilters) => void;
}) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (filters.problem) {
    chips.push({
      key: "problem",
      label: PROBLEM_LABELS[filters.problem] ?? filters.problem,
      clear: () => onChange({ ...filters, problem: null }),
    });
  }
  if (filters.user) {
    chips.push({
      key: "user",
      label: filters.user,
      clear: () => onChange({ ...filters, user: "" }),
    });
  }
  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      clear: () => onChange({ ...filters, q: "" }),
    });
  }
  if (filters.source !== "all") {
    chips.push({
      key: "source",
      label: filters.source === "film_tv" ? "Film/TV" : filters.source,
      clear: () => onChange({ ...filters, source: "all" }),
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Showing only:</span>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.clear}
          className="flex items-center gap-1 border px-2 py-0.5 text-xs hover:bg-muted/40"
          style={{ borderColor: BRAND, color: BRAND }}
        >
          {c.label}
          <IconX className="h-3 w-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        clear all
      </button>
    </div>
  );
}

export interface SearchLogsTableProps {
  filters: LogFilters;
  onFiltersChange: (next: LogFilters) => void;
  /** Hide the text/source controls when the parent tab drives the filtering. */
  showControls?: boolean;
  title?: string;
  subtitle?: string;
}

/**
 * The raw log feed. Every tab ends here — a tab picks the question, this
 * component shows the individual searches behind the answer.
 */
export function SearchLogsTable({
  filters,
  onFiltersChange,
  showControls = true,
  title = "Every search",
  subtitle,
}: SearchLogsTableProps) {
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [queryDraft, setQueryDraft] = useState(filters.q);
  const [debouncedQ, setDebouncedQ] = useState(filters.q);

  // Adjust-during-render rather than in an effect: both of these are "prop
  // changed, so derived state is stale", which React wants resolved before
  // paint instead of as a second render pass.

  // Keep the box in sync when a parent tab sets the query for us (e.g. clicking
  // a top query in the Demand tab drills into that query's rows).
  const [lastExternalQ, setLastExternalQ] = useState(filters.q);
  if (lastExternalQ !== filters.q) {
    setLastExternalQ(filters.q);
    setQueryDraft(filters.q);
    setDebouncedQ(filters.q);
  }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(queryDraft), 350);
    return () => clearTimeout(id);
  }, [queryDraft]);

  // Any narrowing invalidates the current page number.
  const filterKey = `${debouncedQ}|${filters.source}|${filters.problem}|${filters.user}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setOffset(0);
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [
      "admin-searches",
      debouncedQ,
      filters.source,
      filters.problem,
      filters.user,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ.trim()) params.set("q", debouncedQ.trim());
      if (filters.source !== "all") params.set("source", filters.source);
      if (filters.problem) params.set("problem", filters.problem);
      if (filters.user) params.set("user", filters.user);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      const res = await api.get<SearchesResponse>(`/api/admin/searches?${params}`);
      return res.data;
    },
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    // A backend redeploy drops in-flight requests; retry so a transient blip
    // recovers on its own instead of stranding the page on an error.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const total = data?.total ?? 0;
  const rows = data?.searches ?? [];
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  const toggle = (entry: SearchLogEntry) =>
    setExpandedId(expandedId === entry.id ? null : entry.id);

  return (
    <section className="border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {subtitle ??
              (total > 0
                ? `${total.toLocaleString()} searches match. Click any row to see exactly what came back.`
                : "Click any row to see exactly what came back.")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 sm:w-auto"
          onClick={() => refetch()}
        >
          <IconRefresh className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      <div className="space-y-3 border-b border-border p-4">
        {showControls && (
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                className="w-full pl-9"
                placeholder="Search the searches…"
              />
            </div>
            <select
              value={filters.source}
              onChange={(e) => onFiltersChange({ ...filters, source: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
            >
              <option value="all">Everywhere</option>
              <option value="search">Plays</option>
              <option value="film_tv">Film/TV</option>
              <option value="demo">Landing page demo</option>
            </select>
            <select
              value={filters.problem ?? ""}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  problem: (e.target.value || null) as LogFilters["problem"],
                })
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-auto"
            >
              <option value="">Good and bad</option>
              <option value="any">Anything that went wrong</option>
              <option value="zero">Nothing found</option>
              <option value="weak">Poor match</option>
              <option value="gap">We don&apos;t have it</option>
              <option value="repeat">They tried again</option>
            </select>
          </div>
        )}
        <ActiveFilterChips filters={filters} onChange={onFiltersChange} />
      </div>

      <div className="p-4">
        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">Loading searches…</p>
        ) : isError ? (
          <p className="py-8 text-center text-destructive">
            {(error as Error)?.message || "Failed to load searches"}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No searches match this. Try clearing a filter.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Mobile */}
            <div className="space-y-3 md:hidden">
              {rows.map((entry) => (
                <Fragment key={entry.id}>
                  <div
                    className="cursor-pointer space-y-2 border border-border/60 bg-card p-3"
                    onClick={() => toggle(entry)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 break-words text-sm font-medium">{entry.query}</p>
                      {expandedId === entry.id ? (
                        <IconChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <IconChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span
                        className={
                          entry.results_count === 0
                            ? "font-medium text-destructive"
                            : "font-medium text-foreground"
                        }
                      >
                        {entry.results_count} results
                      </span>
                      {" · "}
                      {timeAgo(entry.created_at)}
                      {" · "}
                      {entry.user_email || "signed out"}
                    </p>
                    <ProblemFlags entry={entry} />
                    <div className="flex flex-wrap gap-1">
                      <SourceBadge source={entry.source} />
                      {entry.filters_used &&
                        Object.entries(entry.filters_used).map(([k, v]) => (
                          <Badge key={k} variant="outline" className="rounded-none px-2 py-0.5 text-xs">
                            <span className="font-semibold text-foreground">{k}:</span> {String(v)}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  {expandedId === entry.id && (
                    <div className="border border-border/60 bg-muted/10 px-3">
                      <ExpandedResults logId={entry.id} />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">
                      What they typed
                    </th>
                    <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">Who</th>
                    <th className="py-2 text-right text-xs font-medium uppercase tracking-wide">Got</th>
                    <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">
                      How it went
                    </th>
                    <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">Where</th>
                    <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">When</th>
                    <th className="w-8 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <Fragment key={entry.id}>
                      <tr
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                        onClick={() => toggle(entry)}
                      >
                        <td className="max-w-[280px] py-2 pr-3">
                          <p className="truncate font-medium">{entry.query}</p>
                          {entry.filters_used && Object.keys(entry.filters_used).length > 0 && (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {Object.entries(entry.filters_used)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="max-w-[180px] py-2 pr-3">
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.user_email || "signed out"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className={entry.results_count === 0 ? "font-medium text-destructive" : ""}>
                            {entry.results_count}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          <ProblemFlags entry={entry} />
                          {entry.best_cosine != null && (
                            <span className="ml-1 text-[11px] tabular-nums text-muted-foreground">
                              ({entry.best_cosine.toFixed(2)} match)
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <SourceBadge source={entry.source} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">
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
                        <tr>
                          <td colSpan={7} className="bg-muted/10 px-4">
                            <ExpandedResults logId={entry.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {total > 0 && (
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-center text-xs text-muted-foreground sm:text-left">
                  {pageStart}–{pageEnd} of {total.toLocaleString()}
                </p>
                <div className="flex justify-center gap-2 sm:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
