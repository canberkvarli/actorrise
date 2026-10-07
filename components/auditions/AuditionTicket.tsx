"use client";

import Link from "next/link";

import { countdown, STATUS_LABEL, KIND_LABEL, whenLabel, type Audition } from "@/lib/auditions";

export function AuditionTicket({ a, open, now }: { a: Audition; open: boolean; now: Date }) {
  const c = countdown(a.when, now, a.tz);
  const prep = a.prep;
  const runs = prep?.runs ?? 0;
  const noPrep = prep && !prep.steps.some((s) => s.done) && a.scope === "upcoming";
  // Only digits (and "Now") get the big display size; words like "Tomorrow" or "Oct 12" stay small so they never crop.
  const big = /^\d+$/.test(c.n) || c.n === "Now";
  return (
    <Link
      href={`/auditions/${a.id}`}
      className="aud-ticket flex min-h-[84px]"
      data-open={open ? "true" : "false"}
      data-dim={a.scope === "past" ? "true" : "false"}
      aria-current={open ? "page" : undefined}
    >
      <div
        className={`aud-stub flex w-[72px] shrink-0 flex-col items-center justify-center px-2 py-2 ${
          open ? "bg-primary text-primary-foreground" : ""
        }`}
      >
        <span className={big ? `aud-stub-n ${c.n.length > 3 ? "text-xl" : "text-4xl"}` : "aud-dir text-center text-[10px] uppercase leading-tight"}>
          {c.n}
        </span>
        {c.unit && <span className="aud-dir text-[10px] uppercase">{c.unit}</span>}
      </div>
      <div className="min-w-0 flex-1 px-3 py-2.5">
        <p className="aud-title truncate text-xl">{a.project}</p>
        <p className="aud-dir aud-muted mt-0.5 truncate text-[11px] uppercase">
          {[a.role, whenLabel(a)].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="aud-chip px-1.5 py-px" data-tone={a.status === "callback" || a.status === "booked" ? "gel" : undefined}>
            {a.kind === "self_tape" && a.status === "scheduled" ? KIND_LABEL.self_tape : STATUS_LABEL[a.status]}
          </span>
          {runs > 0 && <span className="aud-chip px-1.5 py-px">{runs} {runs === 1 ? "run" : "runs"}</span>}
          {noPrep && <span className="aud-chip px-1.5 py-px">no prep yet</span>}
        </div>
      </div>
    </Link>
  );
}
