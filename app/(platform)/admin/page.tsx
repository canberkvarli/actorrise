"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  IconUsers,
  IconThumbUp,
  IconThumbDown,
  IconFileSearch,
  IconCircleCheck,
  IconCircleX,
  IconCalendar,
  IconDownload,
  IconHeartRateMonitor,
  IconDatabase,
  IconBrain,
  IconRefresh,
  IconAlertTriangle,
  IconCircleCheckFilled,
  IconSearch,
} from "@tabler/icons-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface AdminStats {
  from: string;
  to: string;
  signups: {
    total_users: number;
    by_day: { date: string; count: number }[];
  };
  feedback: {
    total_positive: number;
    total_negative: number;
    by_day: { date: string; positive: number; negative: number }[];
  };
  submissions: {
    by_status: Record<string, number>;
    by_day: { date: string; count: number }[];
    approved_today: number;
    rejected_today: number;
  };
  usage: {
    ai_searches: number;
    scene_partner_sessions: number;
    craft_coach_sessions: number;
    alltime_searches: number;
  };
}

function useAdminStats(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const queryString = params.toString();
  const url = `/api/admin/stats${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: ["admin-stats", from, to],
    queryFn: async () => {
      const res = await api.get<AdminStats>(url);
      return res.data;
    },
  });
}

interface HealthTableRow {
  name: string;
  size_pretty: string;
  bytes: number;
}

interface SystemHealth {
  db: {
    status: "healthy" | "warning" | "critical";
    total_mb: number;
    limit_mb: number;
    percent_used: number;
    tables: HealthTableRow[];
  };
  ai_cost: {
    monthly_searches: number;
    estimated_usd_this_month: number;
    cost_per_search_usd: number;
    alltime_searches: number;
  };
  content: {
    monologue_rows: number;
    film_tv_rows: number;
  };
}

function useSystemHealth(enabled: boolean) {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: async () => {
      const res = await api.get<SystemHealth>("/api/admin/health");
      return res.data;
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

const chartTooltipStyle = {
  borderRadius: "8px",
  backgroundColor: "var(--card)",
  color: "var(--card-foreground)",
  border: "1px solid var(--border)",
};

function getDefaultRange(preset: "7" | "30") {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (preset === "7" ? 7 : 30));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function exportStatsToCsv(stats: AdminStats) {
  const rows: string[] = [];
  rows.push("ActorRise Admin Stats Export");
  rows.push(`Period,${stats.from},${stats.to}`);
  rows.push("");

  rows.push("Summary");
  rows.push("Metric,Value");
  rows.push(`Total users,${stats.signups.total_users}`);
  rows.push(`Feedback positive,${stats.feedback.total_positive}`);
  rows.push(`Feedback negative,${stats.feedback.total_negative}`);
  Object.entries(stats.submissions.by_status).forEach(([k, v]) => {
    rows.push(`Submissions ${k},${v}`);
  });
  rows.push("");

  rows.push("Signups by day");
  rows.push("Date,Count");
  stats.signups.by_day.forEach((d) => rows.push(`${d.date},${d.count}`));
  rows.push("");

  rows.push("Feedback by day");
  rows.push("Date,Positive,Negative");
  stats.feedback.by_day.forEach((d) =>
    rows.push(`${d.date},${d.positive},${d.negative}`)
  );
  rows.push("");

  rows.push("Submissions by day");
  rows.push("Date,Count");
  stats.submissions.by_day.forEach((d) => rows.push(`${d.date},${d.count}`));

  const csv = rows.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `admin-stats-${stats.from}-${stats.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminOverviewPage() {
  const [rangePreset, setRangePreset] = useState<"7" | "30">("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [healthEnabled, setHealthEnabled] = useState(false);

  const { from, to } = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    return getDefaultRange(rangePreset);
  }, [useCustom, customFrom, customTo, rangePreset]);

  const { data: stats, isLoading, error, isError } = useAdminStats(from, to);
  const {
    data: health,
    isLoading: healthLoading,
    refetch: refetchHealth,
  } = useSystemHealth(healthEnabled);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    const message =
      (error as { response?: { status?: number } })?.response?.status === 403
        ? "You don't have permission to view admin stats."
        : "Failed to load stats.";
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        <p>{message}</p>
      </div>
    );
  }

  const cards = [
    {
      title: "Total users",
      value: stats.signups.total_users,
      icon: IconUsers,
    },
    {
      title: "Feedback (positive)",
      value: stats.feedback.total_positive,
      icon: IconThumbUp,
    },
    {
      title: "Feedback (negative)",
      value: stats.feedback.total_negative,
      icon: IconThumbDown,
    },
    {
      title: "Pending manual review",
      value: stats.submissions.by_status.manual_review ?? 0,
      icon: IconFileSearch,
    },
    {
      title: "Approved today",
      value: stats.submissions.approved_today,
      icon: IconCircleCheck,
    },
    {
      title: "Rejected today",
      value: stats.submissions.rejected_today,
      icon: IconCircleX,
    },
    {
      title: "All-time AI searches",
      value: stats.usage.alltime_searches ?? 0,
      icon: IconSearch,
    },
  ];

  const submissionStatusData = Object.entries(stats.submissions.by_status).map(
    ([name, value]) => ({ name: name.replace("_", " "), value })
  );

  return (
    <div className="space-y-6">
      {/* Date range picker + Export */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base flex items-center gap-2">
            <IconCalendar className="h-4 w-4" />
            Date range
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => exportStatsToCsv(stats)}
          >
            <IconDownload className="h-4 w-4" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex gap-2">
            <Button
              variant={!useCustom && rangePreset === "7" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setUseCustom(false);
                setRangePreset("7");
              }}
            >
              Last 7 days
            </Button>
            <Button
              variant={!useCustom && rangePreset === "30" ? "secondary" : "outline"}
              size="sm"
              onClick={() => {
                setUseCustom(false);
                setRangePreset("30");
              }}
            >
              Last 30 days
            </Button>
            <Button
              variant={useCustom ? "secondary" : "outline"}
              size="sm"
              onClick={() => setUseCustom(true)}
            >
              Custom
            </Button>
          </div>
          {useCustom && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground w-full">
            Showing: {stats.from} → {stats.to}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signups over time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.signups.by_day}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(v) => v}
                  contentStyle={chartTooltipStyle}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Signups"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback over time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.feedback.by_day}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(v) => v}
                  contentStyle={chartTooltipStyle}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="positive"
                  name="Positive"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="negative"
                  name="Negative"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submissions by status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={submissionStatusData}
                  layout="vertical"
                  margin={{ left: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    width={55}
                  />
                  <Tooltip contentStyle={chartTooltipStyle} />
                  <Bar
                    dataKey="value"
                    name="Count"
                    fill="var(--primary)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submissions over time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.submissions.by_day}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(v) => v}
                    contentStyle={chartTooltipStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Submissions"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage (period)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div>
            <p className="text-sm text-muted-foreground">AI searches</p>
            <p className="text-xl font-semibold">{stats.usage.ai_searches}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Scene partner sessions</p>
            <p className="text-xl font-semibold">
              {stats.usage.scene_partner_sessions}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Craft coach sessions</p>
            <p className="text-xl font-semibold">
              {stats.usage.craft_coach_sessions}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* System Health Diagnostic */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <IconHeartRateMonitor className="h-4 w-4" />
            System Health
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (!healthEnabled) {
                setHealthEnabled(true);
              } else {
                refetchHealth();
              }
            }}
            disabled={healthLoading}
          >
            <IconRefresh className={`h-4 w-4 ${healthLoading ? "animate-spin" : ""}`} />
            {healthLoading ? "Running…" : health ? "Refresh" : "Run Diagnostic"}
          </Button>
        </CardHeader>
        <CardContent>
          {!health && !healthLoading && (
            <p className="text-sm text-muted-foreground">
              Click &quot;Run Diagnostic&quot; to check DB usage, AI costs, and content counts.
            </p>
          )}
          {healthLoading && (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          )}
          {health && !healthLoading && (
            <div className="space-y-6">

              {/* DB usage bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <IconDatabase className="h-4 w-4" />
                    Database (Supabase free tier)
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    {health.db.status === "critical" && (
                      <IconAlertTriangle className="h-4 w-4 text-destructive" />
                    )}
                    {health.db.status === "warning" && (
                      <IconAlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    {health.db.status === "healthy" && (
                      <IconCircleCheckFilled className="h-4 w-4 text-green-500" />
                    )}
                    <span
                      className={
                        health.db.status === "critical"
                          ? "text-destructive font-semibold"
                          : health.db.status === "warning"
                          ? "text-yellow-600 font-semibold"
                          : "text-green-600 font-semibold"
                      }
                    >
                      {health.db.total_mb} MB / {health.db.limit_mb} MB ({health.db.percent_used}%)
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      health.db.status === "critical"
                        ? "bg-destructive"
                        : health.db.status === "warning"
                        ? "bg-yellow-500"
                        : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(health.db.percent_used, 100)}%` }}
                  />
                </div>
                {health.db.status === "critical" && (
                  <p className="text-xs text-destructive">
                    Critical: DB is over 90% full. Old embeddings or rows must be pruned soon or upgrade Supabase plan.
                  </p>
                )}
                {health.db.status === "warning" && (
                  <p className="text-xs text-yellow-600">
                    Warning: DB is over 75% full. Monitor closely.
                  </p>
                )}
                {/* Top tables */}
                <div className="mt-3 rounded-md border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-medium">Table</th>
                        <th className="text-right px-3 py-2 font-medium">Size</th>
                        <th className="text-right px-3 py-2 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.db.tables.slice(0, 8).map((t) => (
                        <tr key={t.name} className="border-t">
                          <td className="px-3 py-1.5 font-mono">{t.name}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{t.size_pretty}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {((t.bytes / (health.db.total_mb * 1024 * 1024)) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI cost */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <IconBrain className="h-4 w-4" />
                  AI cost estimate (OpenAI embeddings)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">This month searches</p>
                    <p className="text-lg font-semibold">{health.ai_cost.monthly_searches.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Est. cost this month</p>
                    <p className="text-lg font-semibold">${health.ai_cost.estimated_usd_this_month.toFixed(4)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cost per search</p>
                    <p className="text-lg font-semibold">$0.00002</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">All-time searches</p>
                    <p className="text-lg font-semibold">{health.ai_cost.alltime_searches.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Content counts */}
              <div className="space-y-1">
                <p className="text-sm font-medium">Content library</p>
                <div className="flex flex-wrap gap-6 mt-1">
                  <div>
                    <p className="text-xs text-muted-foreground">Monologues</p>
                    <p className="text-lg font-semibold">{health.content.monologue_rows.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Film &amp; TV references</p>
                    <p className="text-lg font-semibold">{health.content.film_tv_rows.toLocaleString()}</p>
                  </div>
                </div>
              </div>

            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
