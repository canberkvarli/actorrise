"use client";

import { useState } from "react";

import { groupByScope, type Audition } from "@/lib/auditions";
import { AuditionTicket } from "./AuditionTicket";

const HEAD = "aud-dir aud-muted mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.1em]";

export function TicketRail({ list, openId, now }: { list: Audition[]; openId: number | null; now: Date }) {
  const g = groupByScope(list);
  const [showPast, setShowPast] = useState(false);
  const openIsPast = g.past.some((a) => a.id === openId);
  const pastShown = showPast || openIsPast;
  return (
    <nav aria-label="Your auditions">
      {g.upcoming.length > 0 && (
        <>
          <h2 className={HEAD}>Coming up</h2>
          <ul className="flex flex-col gap-2.5">
            {g.upcoming.map((a) => (
              <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
            ))}
          </ul>
        </>
      )}
      {g.waiting.length > 0 && (
        <>
          <h2 className={HEAD}>Waiting to hear</h2>
          <ul className="flex flex-col gap-2.5">
            {g.waiting.map((a) => (
              <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
            ))}
          </ul>
        </>
      )}
      {g.past.length > 0 && (
        <>
          <button
            type="button"
            className={`${HEAD} block underline-offset-2 hover:underline`}
            aria-expanded={pastShown}
            disabled={openIsPast}
            onClick={() => setShowPast((v) => !v)}
          >
            Past ({g.past.length}) {pastShown ? "hide" : "show"}
          </button>
          {pastShown && (
            <ul className="flex flex-col gap-2.5">
              {g.past.map((a) => (
                <li key={a.id}><AuditionTicket a={a} open={a.id === openId} now={now} /></li>
              ))}
            </ul>
          )}
        </>
      )}
    </nav>
  );
}
