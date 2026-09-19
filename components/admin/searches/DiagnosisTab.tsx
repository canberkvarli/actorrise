"use client";

import { useQuery } from "@tanstack/react-query";

import api from "@/lib/api";
import {
  queryFilter,
  type Diagnosis,
  type DiagnosisQuery,
} from "@/lib/searchDiagnosis";
import { Funnel } from "./Funnel";
import { useTrackQuery } from "./useTrackQuery";
import { BRAND, type LogFilters } from "./shared";

/**
 * One funnel, then the only split that changes what gets done next: content we
 * do not hold, against pieces we do that search could not find.
 *
 * The have-it side self-cleans. It is judged by the same detection the live
 * search runs, so "kill bill" left this list the moment the subtitle-head fix
 * shipped, with nothing to run and nothing to remember.
 */
export function DiagnosisTab({
  onDrillIntoQuery,
}: {
  onDrillIntoQuery: (f: LogFilters) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-search-diagnosis"],
    queryFn: async () => {
      const res = await api.get<Diagnosis>("/api/admin/searches/diagnosis");
      return res.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <p className="py-10 text-center text-muted-foreground">Reading the logs…</p>
    );
  }
  if (isError || !data) {
    return (
      <p className="py-10 text-center text-muted-foreground">
        Couldn&apos;t read the logs just now. Refresh to try again.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <Funnel d={data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <QueryColumn
          heading="We don't have it"
          subheading="content to add"
          searches={data.missing.searches}
          queries={data.missing.queries}
          onOpen={(q) => onDrillIntoQuery(queryFilter(q))}
          trackable
        />
        <QueryColumn
          heading="We have it"
          subheading="search to fix"
          searches={data.have_it.searches}
          queries={data.have_it.queries}
          onOpen={(q) => onDrillIntoQuery(queryFilter(q))}
        />
      </div>

      <div className="space-y-1 border-t border-border/40 pt-4 text-sm text-muted-foreground">
        {data.most_asked.length > 0 && (
          <p>
            Asked for most:{" "}
            {data.most_asked.map((m, i) => (
              <span key={m.query}>
                {i > 0 && " · "}
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => onDrillIntoQuery(queryFilter(m.query))}
                >
                  {m.query}
                </button>{" "}
                <span className="tabular-nums">{m.count}</span>
              </span>
            ))}
          </p>
        )}
        {data.struggling_actors > 0 && (
          <p>
            <strong className="tabular-nums text-foreground">
              {data.struggling_actors}
            </strong>{" "}
            actors searched three or more times and mostly came up short.
          </p>
        )}
      </div>
    </div>
  );
}

function QueryColumn({
  heading,
  subheading,
  searches,
  queries,
  onOpen,
  trackable = false,
}: {
  heading: string;
  subheading: string;
  searches: number;
  queries: DiagnosisQuery[];
  onOpen: (query: string) => void;
  trackable?: boolean;
}) {
  const track = useTrackQuery();

  return (
    <section>
      <header className="mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em]">
          {heading}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <strong className="tabular-nums" style={{ color: BRAND }}>
            {searches.toLocaleString()}
          </strong>{" "}
          searches · {subheading}
        </p>
      </header>

      {queries.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-1">
          {queries.slice(0, 12).map((q) => (
            <li key={q.query} className="flex items-baseline gap-3 text-sm">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left underline-offset-2 hover:underline"
                onClick={() => onOpen(q.query)}
                title={q.resolves_to ? `we hold: ${q.resolves_to}` : undefined}
              >
                {q.query}
              </button>
              <span className="tabular-nums text-muted-foreground">{q.count}</span>
              {trackable && (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => track.mutate(q.query)}
                >
                  track
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
