"use client";

import { useState } from "react";

import { SearchLogsTable } from "./SearchLogsTable";
import { useTrackQuery } from "./useTrackQuery";
import {
  BRAND,
  EMPTY_FILTERS,
  Panel,
  QueryBarList,
  StatTile,
  share,
  useSearchSummary,
  type ProblemFilter,
} from "./shared";

/**
 * "What's broken" — the default view.
 *
 * The old page reported the same facts as five raw metrics (weak_match_rate,
 * avg cosine, match_strategy…). The numbers were right and unreadable. Here the
 * same signals lead with a sentence, and every tile is a way into the rows
 * behind it, so a bad number is one click from the searches that caused it.
 */
export function ProblemsTab() {
  const { data: summary, isLoading } = useSearchSummary();
  const [problem, setProblem] = useState<ProblemFilter>("any");
  const track = useTrackQuery();
  const [trackedQueries, setTrackedQueries] = useState<string[]>([]);

  const handleTrack = (query: string) => {
    track.mutate(query, { onSuccess: () => setTrackedQueries((prev) => [...prev, query]) });
  };

  if (isLoading || !summary) {
    return <p className="py-10 text-center text-muted-foreground">Reading the logs…</p>;
  }

  const total = summary.total_searches;
  const zero = summary.zero_result_count;
  const weak = summary.weak_match_count;
  const repeats = summary.repeat_count ?? 0;
  const gaps = summary.content_gap_count;

  // A search is "bad" if it returned nothing or returned junk. Repeats overlap
  // with both, so they're reported alongside rather than added in.
  const bad = zero + weak;
  const scoreable = summary.scoreable_count ?? total;

  const toggle = (next: ProblemFilter) => setProblem(problem === next ? "any" : next);

  const weakQueries = (summary.top_weak_queries ?? []).map((w) => ({
    query: w.query,
    count: w.count,
    caption: w.avg_cosine != null ? `${w.avg_cosine.toFixed(2)} match` : undefined,
  }));

  return (
    <div className="space-y-4">
      <section className="border-l-2 bg-card p-4" style={{ borderColor: BRAND }}>
        <p className="text-base leading-relaxed">
          Actors ran <strong className="tabular-nums">{total.toLocaleString()}</strong> searches in
          the last 30 days.{" "}
          <strong className="tabular-nums" style={{ color: BRAND }}>
            {bad.toLocaleString()}
          </strong>{" "}
          of them ({share(bad, total)}) ended in a shrug — nothing found, or nothing good enough.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          That&apos;s the number to push down. Everything below breaks it apart so you can see
          whether it&apos;s missing content or a search that isn&apos;t finding what you already
          have.
        </p>
      </section>

      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Nothing found"
          value={zero.toLocaleString()}
          caption={`${share(zero, total)} of searches showed an empty screen`}
          tone={zero > 0 ? "alert" : undefined}
          active={problem === "zero"}
          onClick={() => toggle("zero")}
        />
        <StatTile
          label="Poor match"
          value={weak.toLocaleString()}
          caption={`${share(weak, scoreable)} of the ${scoreable.toLocaleString()} searches we can score — results came back but weren't close`}
          tone={summary.weak_match_rate > 15 ? "alert" : undefined}
          active={problem === "weak"}
          onClick={() => toggle("weak")}
        />
        <StatTile
          label="Tried again"
          value={repeats.toLocaleString()}
          caption={`Re-ran the same words within 10 minutes — ${summary.retry_users} did it three or more times`}
          tone={(summary.repeat_rate ?? 0) > 10 ? "alert" : undefined}
          active={problem === "repeat"}
          onClick={() => toggle("repeat")}
        />
        <StatTile
          label="We don't have it"
          value={gaps.toLocaleString()}
          caption="Searches we recognised as a real title we're missing"
          active={problem === "gap"}
          onClick={() => toggle("gap")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Came up empty"
          subtitle="They typed this and got a blank screen. Track one to add it to your list."
        >
          <QueryBarList
            items={summary.top_zero_result_queries.map((z) => ({ query: z.query, count: z.count }))}
            emptyLabel="Nothing came up empty. Good."
            action={{
              label: "track",
              onClick: handleTrack,
              busyQuery: track.isPending ? track.variables : null,
            }}
          />
        </Panel>

        <Panel
          title="Found something, but it was wrong"
          subtitle="These are the sneaky ones — the actor got a full page of results that didn't fit."
        >
          <QueryBarList items={weakQueries} emptyLabel="No weak matches worth chasing." />
        </Panel>
      </div>

      {trackedQueries.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Added to Requests: {trackedQueries.join(", ")}. They&apos;re on the{" "}
          <strong>Requests</strong> tab marked &ldquo;I&apos;ll add it&rdquo;.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Panel
          title="How searches are being answered"
          subtitle="Named-title lookups skip the AI matching entirely — a healthy share here means people are asking for specific plays."
        >
          <QueryBarList
            items={summary.by_match_strategy.map((s) => ({
              query: s.key.replace(/_/g, " "),
              count: s.count,
            }))}
            emptyLabel="No data"
          />
        </Panel>
        <Panel
          title="What kind of thing they're asking for"
          subtitle="A title, a person, or a vibe. Vibe searches are the ones that need good AI matching."
        >
          <QueryBarList
            items={(summary.by_query_type ?? []).map((s) => ({
              query: s.key.replace(/_/g, " "),
              count: s.count,
            }))}
            emptyLabel="No data"
          />
        </Panel>
      </div>

      <SearchLogsTable
        filters={{ ...EMPTY_FILTERS, problem }}
        onFiltersChange={(next) => setProblem(next.problem)}
        showControls={false}
        title="The searches behind those numbers"
        subtitle="Click a row to see exactly what the actor was shown."
      />
    </div>
  );
}
