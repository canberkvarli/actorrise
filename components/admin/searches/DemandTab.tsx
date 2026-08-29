"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import { useTrackQuery } from "./useTrackQuery";
import {
  BRAND,
  Panel,
  QueryBarList,
  share,
  timeAgo,
  useSearchSummary,
  type ContentRequestItem,
} from "./shared";

/**
 * "What people want" — demand, not failure.
 *
 * Top queries alone don't tell you what to build; the useful pairing is what
 * they ask for most against what you can't give them. Both lists sit side by
 * side here, and anything missing can be tracked in one click.
 */
export function DemandTab({ onDrillIntoQuery }: { onDrillIntoQuery: (query: string) => void }) {
  const { data: summary, isLoading } = useSearchSummary();
  const track = useTrackQuery();
  const [tracked, setTracked] = useState<string[]>([]);

  const { data: requestData } = useQuery({
    queryKey: ["admin-content-requests"],
    queryFn: async () => {
      const res = await api.get<{ requests: ContentRequestItem[] }>("/api/admin/content-requests");
      return res.data;
    },
    staleTime: 60_000,
  });

  if (isLoading || !summary) {
    return <p className="py-10 text-center text-muted-foreground">Reading the logs…</p>;
  }

  const openRequests = (requestData?.requests ?? []).filter(
    (r) => r.status === "requested" || r.status === "planned"
  );

  const handleTrack = (query: string) => {
    track.mutate(query, { onSuccess: () => setTracked((prev) => [...prev, query]) });
  };

  const missing = [
    ...summary.top_zero_result_queries.map((z) => ({ query: z.query, count: z.count })),
    ...(summary.top_weak_queries ?? []).map((w) => ({ query: w.query, count: w.count })),
  ]
    // A query can be both empty for one actor and weak for another — collapse
    // them so the "most wanted" list ranks by total unmet demand.
    .reduce<{ query: string; count: number }[]>((acc, item) => {
      const hit = acc.find((a) => a.query === item.query);
      if (hit) hit.count += item.count;
      else acc.push({ ...item });
      return acc;
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="space-y-4">
      <section className="border-l-2 bg-card p-4" style={{ borderColor: BRAND }}>
        <p className="text-base leading-relaxed">
          The <strong className="tabular-nums">{summary.total_searches.toLocaleString()}</strong>{" "}
          searches below are a free list of what actors want from you. The right-hand column is the
          part you can&apos;t sell them yet.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Asked for the most"
          subtitle="Click a query to read every log row for it."
        >
          <QueryBarList
            items={summary.top_queries.map((t) => ({
              query: t.query,
              count: t.count,
              caption: share(t.count, summary.total_searches),
            }))}
            emptyLabel="No searches yet."
            onSelect={onDrillIntoQuery}
          />
        </Panel>

        <Panel
          title="Wanted but missing"
          subtitle="Empty and poor-match searches combined — the strongest signal for what to source next."
        >
          <QueryBarList
            items={missing}
            emptyLabel="Nothing obviously missing."
            onSelect={onDrillIntoQuery}
            action={{
              label: "track",
              onClick: handleTrack,
              busyQuery: track.isPending ? track.variables : null,
            }}
          />
        </Panel>
      </div>

      {tracked.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Tracked: {tracked.join(", ")} — see the <strong>Requests</strong> tab.
        </p>
      )}

      <Panel
        title="Still on your list"
        subtitle={`${openRequests.length} title${openRequests.length === 1 ? "" : "s"} actors asked for that you haven't added yet.`}
      >
        {openRequests.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing outstanding. Everything requested has been added or closed.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {openRequests.slice(0, 12).map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="truncate text-sm">
                  {r.play_title}
                  {r.author && <span className="text-muted-foreground"> · {r.author}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {r.request_count}× · {timeAgo(r.last_requested_at)}
                  {r.status === "planned" && (
                    <span className="ml-2" style={{ color: BRAND }}>
                      on your list
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
