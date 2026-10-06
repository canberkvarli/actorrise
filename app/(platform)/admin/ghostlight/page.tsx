"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * The Ghost Light iOS app, as the backend sees it.
 *
 * Installs, impressions and proceeds live in App Store Connect and never reach
 * us; what reaches us is RevenueCat, one webhook per purchase, renewal,
 * cancellation and expiry. For six weeks every one of those deliveries failed
 * on auth and this page would have been empty while two people paid Apple.
 * The "last event" line at the top is the canary: if it goes stale while the
 * app has subscribers, the webhook is broken again.
 */

type Summary = {
  active_paid: number;
  cancelling: number;
  past_due: number;
  expired: number;
  mrr_list_price: number;
  events_30d: Record<string, number>;
  last_event_at: string | null;
  webhook_url: string;
};

type Sub = {
  user_id: number;
  email: string;
  name: string;
  tier: string;
  status: string;
  billing_period: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  updated_at: string | null;
};

type Ev = {
  at: string | null;
  user_id: number;
  email: string;
  type: string;
  product_id: string;
  period_type: string;
  environment: string;
  price: string | number;
  expires_at: string;
};

type Overview = { summary: Summary; subscriptions: Sub[]; events: Ev[] };

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function day(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function GhostLightAdminPage() {
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["admin", "ghostlight"],
    queryFn: async () => (await api.get<Overview>("/api/admin/ghostlight")).data,
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="p-6 text-sm text-destructive">Could not load the app data.</p>;

  const s = data.summary;
  const stale = daysSince(s.last_event_at);
  const canary =
    s.last_event_at === null
      ? "No RevenueCat event has ever reached the server."
      : stale !== null && stale > 14
        ? `Last event ${stale} days ago. With ${s.active_paid} paying, that is too quiet; check the webhook.`
        : `Last event ${when(s.last_event_at)}.`;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ghost Light</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The iOS app, through RevenueCat. Installs and store impressions are in App Store Connect; money is here.
        </p>
      </div>

      <p
        className={
          "border px-3 py-2 text-sm " +
          (s.last_event_at === null || (stale !== null && stale > 14)
            ? "border-destructive/50 bg-destructive/5 text-destructive"
            : "border-border bg-card text-muted-foreground")
        }
      >
        {canary} Webhook: <code className="text-xs">{s.webhook_url}</code>
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Paying" value={s.active_paid} />
        <Stat label="MRR at list price" value={`$${s.mrr_list_price.toFixed(2)}`} hint="$4.99 monthly, $29.99 a year" />
        <Stat label="Cancelling" value={s.cancelling} hint="auto-renew off, access until period end" />
        <Stat label="Past due" value={s.past_due} />
        <Stat label="Expired" value={s.expired} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {data.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Who</th>
                  <th className="py-1 pr-3">Tier</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Period</th>
                  <th className="py-1 pr-3">Ends</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <a href={`/admin/users/${r.user_id}`} className="hover:underline">
                        {r.name || r.email}
                      </a>
                      {r.name && <span className="ml-2 text-xs text-muted-foreground">{r.email}</span>}
                    </td>
                    <td className="py-1.5 pr-3">{r.tier}</td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                      {r.cancel_at_period_end && <span className="ml-2 text-xs text-muted-foreground">cancelling</span>}
                    </td>
                    <td className="py-1.5 pr-3">{r.billing_period}</td>
                    <td className="py-1.5 pr-3">{day(r.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Webhook events
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              last 30 days:{" "}
              {Object.keys(s.events_30d).length === 0
                ? "none"
                : Object.entries(s.events_30d)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Events are recorded from 2026-10-06; purchases before that are in RevenueCat only.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Who</th>
                  <th className="py-1 pr-3">Product</th>
                  <th className="py-1 pr-3">Price</th>
                  <th className="py-1 pr-3">Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{when(e.at)}</td>
                    <td className="py-1.5 pr-3">
                      {e.type}
                      {e.environment === "SANDBOX" && <span className="ml-1 text-xs text-muted-foreground">sandbox</span>}
                      {e.period_type === "TRIAL" && <span className="ml-1 text-xs text-muted-foreground">trial</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <a href={`/admin/users/${e.user_id}`} className="hover:underline">
                        {e.email}
                      </a>
                    </td>
                    <td className="py-1.5 pr-3">{e.product_id}</td>
                    <td className="py-1.5 pr-3">{e.price === "" ? "" : `$${Number(e.price).toFixed(2)}`}</td>
                    <td className="py-1.5 pr-3">{day(e.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
