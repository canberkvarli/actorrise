"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Ghost Light, the iOS app, on one page.
 *
 * Top: the store. How many people Apple showed the listing to, how many
 * opened it, how many installed, by day for 30 days, from App Store Connect.
 * On 2026-10-06 that number was 398 impressions in three weeks and nothing in
 * the admin said so. Below: the money, from RevenueCat, with the purchase
 * roll kept short. Webhook plumbing lives in the server log, not here; the
 * only trace of it is one warning line that appears if purchases go silent
 * for two weeks while people are paying.
 */

type Day = {
  day: string;
  impressions: number | null;
  page_views: number | null;
  downloads: number | null;
  redownloads: number | null;
  iap_units: number | null;
  proceeds_usd: number | null;
  note: string | null;
};

type Store = {
  configured: boolean;
  missing_env: string[];
  last_fetched_at: string | null;
  days: Day[];
  totals_30d: {
    impressions: number | null;
    page_views: number | null;
    downloads: number | null;
    redownloads: number | null;
    iap_units: number | null;
    proceeds_usd: number | null;
    view_rate: number | null;
    install_rate: number | null;
  };
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
};

type Purchase = {
  at: string | null;
  user_id: number;
  who: string;
  type: string;
  product_id: string;
  period_type: string;
  price: string | number;
  /** Apple's word for why, on a cancellation or expiration: UNSUBSCRIBE,
   *  BILLING_ERROR, CUSTOMER_SUPPORT. Empty on purchases and renewals. */
  reason?: string;
};

const REASON_LABEL: Record<string, string> = {
  UNSUBSCRIBE: "they turned auto-renew off",
  BILLING_ERROR: "card failed",
  CUSTOMER_SUPPORT: "refunded by Apple support",
  PRICE_INCREASE: "declined a price increase",
  DEVELOPER_INITIATED: "cancelled from this side",
  SUBSCRIPTION_PAUSED: "paused",
  UNKNOWN: "no reason given",
};

type Money = {
  active_paid: number;
  cancelling: number;
  past_due: number;
  expired: number;
  mrr_list_price: number;
  subscriptions: Sub[];
  purchases: Purchase[];
  webhook_warning: string | null;
};

type Overview = { store: Store; money: Money };

const n = (v: number | null | undefined) => (v === null || v === undefined ? "·" : v.toLocaleString());
const pct = (v: number | null | undefined) => (v === null || v === undefined ? "·" : `${Math.round(v * 100)}%`);
const usd = (v: number | null | undefined) => (v === null || v === undefined ? "·" : `$${v.toFixed(2)}`);
const day = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  // An annual plan renews next year; "Oct 3" without the year read as overdue.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};
const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const TYPE_LABEL: Record<string, string> = {
  INITIAL_PURCHASE: "new",
  RENEWAL: "renewed",
  CANCELLATION: "cancelled",
  EXPIRATION: "expired",
  BILLING_ISSUE: "billing issue",
  UNCANCELLATION: "resubscribed",
  PRODUCT_CHANGE: "changed plan",
};

export default function GhostLightAdminPage() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const { data, isLoading, error } = useQuery<Overview>({
    queryKey: ["admin", "ghostlight"],
    queryFn: async () => (await api.get<Overview>("/api/admin/ghostlight")).data,
    refetchInterval: 120_000,
  });

  async function refresh() {
    setSyncing(true);
    try {
      const r = await api.post<Record<string, unknown>>("/api/admin/ghostlight/sync");
      const notes = (r.data.notes as string[] | undefined) ?? [];
      toast.success(notes.length ? `Pulled from Apple. ${notes.join(" ")}` : "Pulled from Apple.");
      qc.invalidateQueries({ queryKey: ["admin", "ghostlight"] });
    } catch {
      toast.error("Apple did not answer. The server log has the reason.");
    } finally {
      setSyncing(false);
    }
  }

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="p-6 text-sm text-destructive">Could not load the app data.</p>;

  const { store, money } = data;
  const t = store.totals_30d;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ghost Light</h1>
          <p className="mt-1 text-sm text-muted-foreground">The iOS app. Store numbers from App Store Connect, money from RevenueCat.</p>
        </div>
        {store.configured && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {store.last_fetched_at && <span>Apple data as of {when(store.last_fetched_at)}</span>}
            <Button size="sm" variant="outline" onClick={refresh} disabled={syncing}>
              {syncing ? "Pulling…" : "Refresh from Apple"}
            </Button>
          </div>
        )}
      </div>

      {!store.configured ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect App Store Connect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Impressions, page views, downloads and proceeds come from Apple&apos;s App Store Connect API. It needs a
              key, made once, and four values in Render&apos;s environment for <code>actorrise-api</code>:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → Generate.
                Role: <b>Admin</b> (Sales and Finance is not enough for analytics). Download the <code>.p8</code> once.
              </li>
              <li>
                <code>ASC_ISSUER_ID</code> and <code>ASC_KEY_ID</code> from that page; <code>ASC_PRIVATE_KEY</code> is the whole{" "}
                <code>.p8</code> file contents; <code>ASC_VENDOR_NUMBER</code> is top right in Payments and Financial Reports.
              </li>
              <li>Redeploy, come back here, press Refresh from Apple. Impressions and views arrive about a day later; proceeds the same day.</li>
            </ol>
            <p className="text-muted-foreground">Still missing: {store.missing_env.join(", ")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Stat label="Impressions" value={n(t.impressions)} hint="store showed the listing, 30 days" />
            <Stat label="Page views" value={n(t.page_views)} hint={`${pct(t.view_rate)} of impressions`} />
            <Stat label="Downloads" value={n(t.downloads)} hint={`${pct(t.install_rate)} of views`} />
            <Stat label="Redownloads" value={n(t.redownloads)} />
            <Stat label="IAP units" value={n(t.iap_units)} hint="purchases and renewals" />
            <Stat label="Proceeds" value={usd(t.proceeds_usd)} hint="after Apple's cut" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By day, last 30</CardTitle>
            </CardHeader>
            <CardContent>
              {store.days.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing pulled yet. Press Refresh from Apple. The first analytics instances appear about a day after the
                  report request is made, so an empty table on day one is normal.
                </p>
              ) : (
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Day</th>
                      <th className="py-1 pr-3 text-right">Impressions</th>
                      <th className="py-1 pr-3 text-right">Views</th>
                      <th className="py-1 pr-3 text-right">Downloads</th>
                      <th className="py-1 pr-3 text-right">Redownloads</th>
                      <th className="py-1 pr-3 text-right">IAP</th>
                      <th className="py-1 pr-3 text-right">Proceeds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...store.days].reverse().map((d) => (
                      <tr key={d.day} className="border-t border-border">
                        <td className="py-1 pr-3">
                          {day(d.day)}
                          {d.note && (
                            <span className="ml-2 text-xs text-muted-foreground" title={d.note}>
                              ?
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-3 text-right">{n(d.impressions)}</td>
                        <td className="py-1 pr-3 text-right">{n(d.page_views)}</td>
                        <td className="py-1 pr-3 text-right">{n(d.downloads)}</td>
                        <td className="py-1 pr-3 text-right">{n(d.redownloads)}</td>
                        <td className="py-1 pr-3 text-right">{n(d.iap_units)}</td>
                        <td className="py-1 pr-3 text-right">{usd(d.proceeds_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {money.webhook_warning && (
        <p className="border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">{money.webhook_warning}</p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Paying" value={money.active_paid} />
        <Stat label="MRR at list price" value={usd(money.mrr_list_price)} hint="$4.99 monthly, $29.99 a year" />
        <Stat label="Cancelling" value={money.cancelling} hint="access until period end" />
        <Stat label="Past due" value={money.past_due} />
        <Stat label="Expired" value={money.expired} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          {money.subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3">Who</th>
                  <th className="py-1 pr-3">Status</th>
                  <th className="py-1 pr-3">Plan</th>
                  <th className="py-1 pr-3">Renews</th>
                </tr>
              </thead>
              <tbody>
                {money.subscriptions.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="py-1.5 pr-3">
                      <a href={`/admin/users/${r.user_id}`} className="hover:underline">
                        {r.name || r.email}
                      </a>
                      {r.name && <span className="ml-2 text-xs text-muted-foreground">{r.email}</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                      {r.cancel_at_period_end && <span className="ml-2 text-xs text-muted-foreground">cancelling</span>}
                    </td>
                    <td className="py-1.5 pr-3">{r.tier === "monologues" ? `Monologues, ${r.billing_period}` : "Free"}</td>
                    <td className="py-1.5 pr-3">{day(r.current_period_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {money.purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent purchases and renewals</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {money.purchases.map((p, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 border-t border-border py-1.5 first:border-t-0">
                  <span className="w-28 text-muted-foreground">{when(p.at)}</span>
                  <a href={`/admin/users/${p.user_id}`} className="hover:underline">
                    {p.who}
                  </a>
                  <span>{TYPE_LABEL[p.type] ?? p.type.toLowerCase()}</span>
                  {p.period_type === "TRIAL" && <span className="text-muted-foreground">trial</span>}
                  <span className="text-muted-foreground">{p.product_id}</span>
                  {p.reason && (
                    <span className="text-muted-foreground">{REASON_LABEL[p.reason] ?? p.reason.toLowerCase()}</span>
                  )}
                  {p.price !== "" && <span className="ml-auto tabular-nums">{usd(Number(p.price))}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
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
