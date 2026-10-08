"use client";

import { useState } from "react";

import { groupByScope, type Audition } from "@/lib/auditions";
import { AuditionTicket } from "./AuditionTicket";

const HEAD = "aud-dir aud-muted text-xs font-semibold uppercase tracking-[0.12em]";

/** The rest of the auditions, as reels under the open ticket. Past ones fold into a logbook. */
export function TicketRail({ list, openId, now }: { list: Audition[]; openId: number | null; now: Date }) {
  const g = groupByScope(list);
  const [showPast, setShowPast] = useState(false);
  const openIsPast = g.past.some((a) => a.id === openId);
  const pastShown = showPast || openIsPast;
  const callbacks = g.past.filter((a) => a.status === "callback" || a.status === "booked").length;
  return (
    <nav aria-label="Your auditions" className="grid gap-8">
      {g.upcoming.length > 0 && <Reel title="Coming up" list={g.upcoming} openId={openId} now={now} />}
      {g.waiting.length > 0 && <Reel title="Waiting to hear" list={g.waiting} openId={openId} now={now} />}
      {g.past.length > 0 && (
        <div>
          <button
            type="button"
            className={`${HEAD} underline-offset-2 hover:underline`}
            aria-expanded={pastShown}
            disabled={openIsPast}
            onClick={() => setShowPast((v) => !v)}
          >
            Logbook · {g.past.length} done{callbacks > 0 && ` · ${callbacks} ${callbacks === 1 ? "callback" : "callbacks"}`} · {pastShown ? "hide" : "show"}
          </button>
          {pastShown && <Reel list={g.past} openId={openId} now={now} />}
        </div>
      )}
    </nav>
  );
}

function Reel({ title, list, openId, now }: { title?: string; list: Audition[]; openId: number | null; now: Date }) {
  return (
    <div>
      {title && <h2 className={HEAD}>{title}</h2>}
      <ul className="aud-reel -mx-4 mt-1 flex snap-x gap-4 overflow-x-auto px-4 pb-4 pt-3 sm:mx-0 sm:px-0">
        {list.map((a) => (
          <li key={a.id} className="w-[min(280px,80vw)] shrink-0 snap-start">
            <AuditionTicket a={a} open={a.id === openId} now={now} />
          </li>
        ))}
      </ul>
    </div>
  );
}
