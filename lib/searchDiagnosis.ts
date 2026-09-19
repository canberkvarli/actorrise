export type DiagnosisQuery = {
  query: string;
  count: number;
  resolves_to?: string | null;
};

export type Diagnosis = {
  total: number;
  found: number;
  short: number;
  have_it: { searches: number; queries: DiagnosisQuery[] };
  missing: { searches: number; queries: DiagnosisQuery[] };
  most_asked: { query: string; count: number }[];
  struggling_actors: number;
};

export type FunnelBar = { label: string; value: number; pct: number };

/**
 * The two bars, each as a share of the total.
 *
 * Rounded so they sum to exactly 100: the point of the funnel is that its
 * numbers add up, and two independently rounded halves showing 71 + 28 would
 * undo that on the one screen built to fix it.
 */
export function funnelBars(d: Diagnosis): [FunnelBar, FunnelBar] {
  if (!d.total) {
    return [
      { label: "found something", value: 0, pct: 0 },
      { label: "came up short", value: 0, pct: 0 },
    ];
  }
  const foundPct = Math.round((d.found / d.total) * 100);
  return [
    { label: "found something", value: d.found, pct: foundPct },
    { label: "came up short", value: d.short, pct: 100 - foundPct },
  ];
}

/** Open the raw feed at the searches behind one query. */
export function queryFilter(query: string) {
  return { q: query, source: "all" as const, problem: "any" as const, user: "" };
}
