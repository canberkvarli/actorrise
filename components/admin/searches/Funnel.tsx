"use client";

import { funnelBars, type Diagnosis } from "@/lib/searchDiagnosis";
import { BRAND } from "./shared";

/**
 * Two bars and a total. No charting library: this is a div with a width.
 *
 * It replaces five stat tiles that counted the same searches five different
 * ways -- zero, weak, repeat, gap and wrong_tab all overlap, so none of them
 * added up to any other, and the headline above them reported 382 by adding 33
 * empty to 349 poor when a search can be both.
 */
export function Funnel({ d }: { d: Diagnosis }) {
  const [found, short] = funnelBars(d);

  return (
    <section className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <strong className="tabular-nums text-foreground">
          {d.total.toLocaleString()}
        </strong>{" "}
        searches · last 30 days
      </p>

      {[found, short].map((bar, i) => (
        <div key={bar.label} className="flex items-center gap-3">
          <div className="h-6 flex-1 bg-muted/40">
            <div
              className="h-full transition-[width] duration-500"
              style={{
                width: `${bar.pct}%`,
                backgroundColor: i === 0 ? "var(--muted-foreground)" : BRAND,
              }}
            />
          </div>
          <p className="w-52 shrink-0 text-sm tabular-nums">
            <strong>{bar.value.toLocaleString()}</strong>{" "}
            <span className="text-muted-foreground">
              {bar.label} · {bar.pct}%
            </span>
          </p>
        </div>
      ))}
    </section>
  );
}
