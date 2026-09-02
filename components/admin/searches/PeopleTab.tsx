"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BRAND, Panel, share, StatTile, timeAgo, useSearchUsers } from "./shared";

/**
 * "Who is this" — one row per actor instead of interleaved log lines.
 *
 * A single frustrated user is invisible in a reverse-chronological feed; their
 * eight failed searches sit between other people's successes. Grouped, the
 * shape of one person's session is obvious, and "struggling" becomes a thing
 * you can sort by.
 */
export function PeopleTab({ onDrillIntoUser }: { onDrillIntoUser: (email: string) => void }) {
  const { data, isLoading } = useSearchUsers();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"searches" | "struggle">("searches");

  const users = useMemo(() => data?.users ?? [], [data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = users.filter((u) => !needle || (u.email ?? "").toLowerCase().includes(needle));
    const withRate = filtered.map((u) => ({
      ...u,
      // A "bad" search is one that found nothing or found the wrong thing.
      badRate: u.searches ? u.bad_searches / u.searches : 0,
    }));
    return withRate.sort((a, b) =>
      sort === "searches" ? b.searches - a.searches : b.badRate - a.badRate
    );
  }, [users, search, sort]);

  if (isLoading) {
    return <p className="py-10 text-center text-muted-foreground">Reading the logs…</p>;
  }

  const totalSearches = users.reduce((sum, u) => sum + u.searches, 0);
  // Someone with real usage and a majority-bad hit rate is actively having a
  // bad time — worth an email, not just a metric.
  const struggling = rows.filter((u) => u.searches >= 3 && u.badRate >= 0.5);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Actors searching"
          value={users.length.toLocaleString()}
          caption="Signed-in people who ran at least one search"
        />
        <StatTile
          label="Searches each"
          value={users.length ? (totalSearches / users.length).toFixed(1) : "0"}
          caption="Average per person over the window"
        />
        <StatTile
          label="Having a bad time"
          value={struggling.length.toLocaleString()}
          caption="3+ searches and over half of them failed"
          tone={struggling.length > 0 ? "alert" : undefined}
        />
        <StatTile
          label="Signed out"
          value={(data?.anonymous_searches ?? 0).toLocaleString()}
          caption="Searches with nobody attached — landing demo and logged-out visits"
        />
      </div>

      {struggling.length > 0 && (
        <section className="border-l-2 bg-card p-4" style={{ borderColor: BRAND }}>
          <p className="text-sm">
            <strong>{struggling.length}</strong> actor{struggling.length === 1 ? "" : "s"} searched
            three or more times and mostly came up short:{" "}
            {struggling
              .slice(0, 4)
              .map((u) => u.email ?? `user ${u.user_id}`)
              .join(", ")}
            {struggling.length > 4 ? ", and more" : ""}. Worth a look before they go quiet.
          </p>
        </section>
      )}

      <Panel
        title="Everyone who searched"
        subtitle="Click a row to read that actor's searches in order."
        action={
          <div className="flex gap-2">
            <Button
              variant={sort === "searches" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSort("searches")}
            >
              Busiest
            </Button>
            <Button
              variant={sort === "struggle" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSort("struggle")}
            >
              Struggling most
            </Button>
          </div>
        }
      >
        <div className="relative mb-3 w-full sm:w-72">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Find an actor by email…"
          />
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nobody matches that.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">Actor</th>
                  <th className="py-2 text-right text-xs font-medium uppercase tracking-wide">
                    Searches
                  </th>
                  <th className="py-2 text-right text-xs font-medium uppercase tracking-wide">
                    Different things
                  </th>
                  <th className="py-2 text-right text-xs font-medium uppercase tracking-wide">
                    Went badly
                  </th>
                  <th className="py-2 text-left text-xs font-medium uppercase tracking-wide">
                    Last search
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr
                    key={u.user_id}
                    className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                    onClick={() => u.email && onDrillIntoUser(u.email)}
                  >
                    <td className="max-w-[260px] py-2 pr-3">
                      <span className="block truncate">{u.email ?? `user ${u.user_id}`}</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{u.searches}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {u.distinct_queries}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <span style={{ color: u.badRate >= 0.5 ? BRAND : undefined }}>
                        {share(u.bad_searches, u.searches)}
                      </span>
                      {u.repeats > 0 && (
                        <span className="ml-1 text-[11px] text-muted-foreground">
                          · {u.repeats} retried
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 text-muted-foreground">
                      {timeAgo(u.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
