"use client";

import { useState } from "react";
import Link from "next/link";

import {
  clockIn, directionsUrl, groupByScope, KIND_LABEL, safeTz, whenLabel, type Audition, type Travel,
} from "@/lib/auditions";
import { LeavingFrom } from "./GettingThere";

const THROUGH_LABEL = { agent: "your agent", manager: "your manager", self: "you put yourself up" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <dt className="aud-cap-muted text-[12px] font-semibold">{label}</dt>
      <dd className="mt-0.5 break-words text-[15px] leading-snug">{children}</dd>
    </div>
  );
}

/** The facts, at a glance: when, where, for what, who's casting, who put you up. */
export function FileDetails({ a, travel, onEdit }: { a: Audition; travel: Travel | undefined; onEdit: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const inPerson = a.kind === "in_person";
  const early = inPerson && a.starts_at ? clockIn(new Date(new Date(a.starts_at).getTime() - 15 * 60_000).toISOString(), a.tz) : null;
  const [place, ...rest] = (a.location ?? "").split(",");

  return (
    <div>
      <dl>
        <Row label={a.kind === "self_tape" ? "Due" : "When"}>
          {a.when ? whenLabel(a) : <span className="aud-cap-muted">No date yet</span>}
          {early && a.scope === "upcoming" && <span className="aud-cap-muted block text-[13.5px]">be there by {early}</span>}
        </Row>
        {a.location && (
          <Row label="Where">
            {place}
            {rest.length > 0 && <span className="aud-cap-muted block text-[13.5px]">{rest.join(",").trim()}</span>}
            {inPerson && (
              <span className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
                <a className="aud-link" href={directionsUrl(a.location)} target="_blank" rel="noreferrer">Directions</a>
              </span>
            )}
            {inPerson && a.scope === "upcoming" && !travel?.leaving_from && (
              leaving ? (
                <LeavingFrom travel={travel} onDone={() => setLeaving(false)} />
              ) : (
                <button type="button" className="aud-link aud-cap-muted mt-1 block text-left text-[13px]" onClick={() => setLeaving(true)}>
                  Tell me where you&apos;re leaving from and I&apos;ll plan the trip.
                </button>
              )
            )}
          </Row>
        )}
        <Row label="For">
          {a.project}
          <span className="aud-cap-muted block text-[13.5px]">
            {[a.role, KIND_LABEL[a.kind]].filter(Boolean).join(" · ")}
          </span>
        </Row>
        {a.casting && <Row label="Casting">{a.casting}</Row>}
        {(a.through || a.through_kind) && (
          <Row label="Through">
            {a.through ?? (a.through_kind === "self" ? "You" : "")}
            {a.through_kind && a.through && <span className="aud-cap-muted block text-[13.5px]">{THROUGH_LABEL[a.through_kind]}</span>}
            {a.through_kind === "self" && !a.through && <span className="aud-cap-muted block text-[13.5px]">you put yourself up</span>}
          </Row>
        )}
        {a.shoots && <Row label="Shoots">{a.shoots}</Row>}
        {a.material_raw && <Row label="Asked for">{a.material_raw}</Row>}
        {a.tape_link && (
          <Row label="Tape">
            <a className="aud-link" href={a.tape_link} target="_blank" rel="noreferrer">your tape</a>
          </Row>
        )}
      </dl>
      <button type="button" className="aud-link aud-cap-muted mt-4 text-[13.5px]" onClick={onEdit}>
        Edit details
      </button>
      {a.notes && <p className="aud-cap-muted mt-4 whitespace-pre-wrap break-words text-[13.5px]">{a.notes}</p>}
    </div>
  );
}

/** One line on what I'll send, in my voice. */
export function ReminderLine({ a }: { a: Audition }) {
  if (a.scope !== "upcoming") return null;
  return (
    <div className="mt-8">
      <div className="aud-sec-head !mb-2">
        <h2 className="aud-sec-title text-[22px]">I&apos;ll remind you</h2>
      </div>
      <p className="aud-pencil-muted text-[17px] leading-snug">
        {a.reminders_on
          ? a.kind === "self_tape"
            ? "(three days before it's due, the night before, and the morning after.)"
            : "(three days out, the night before, and the morning after.)"
          : "(reminders are off for this one.)"}
      </p>
    </div>
  );
}

function Mini({ a }: { a: Audition }) {
  const d = a.when ? new Date(a.when) : null;
  const tz = safeTz(a.tz);
  const month = d?.toLocaleDateString("en-US", { month: "short", timeZone: tz }).toUpperCase();
  const day = d?.toLocaleDateString("en-US", { day: "numeric", timeZone: tz });
  return (
    <Link href={`/auditions/${a.id}`} className="aud-mini aud-focus mt-2.5">
      <span className="aud-mini-stub py-2">
        <span className="aud-cap-muted block text-[10.5px] font-semibold tracking-[0.08em]">
          {a.kind === "self_tape" && a.scope === "upcoming" ? "DUE" : month ?? "TBD"}
        </span>
        <span className="aud-sec-title block text-[26px]">{day ?? "?"}</span>
      </span>
      <span className="min-w-0 px-3 py-2">
        <span className="block truncate text-[14.5px]">{a.project}</span>
        <span className="aud-cap-muted block truncate text-[12.5px]">
          {[a.role, a.kind === "in_person" ? null : KIND_LABEL[a.kind]].filter(Boolean).join(" · ") || " "}
        </span>
      </span>
    </Link>
  );
}

/** Every other audition, quietly. Never the open one. */
export function OtherAuditions({ list, openId }: { list: Audition[]; openId: number }) {
  const g = groupByScope(list.filter((a) => a.id !== openId));
  const [logbook, setLogbook] = useState(false);
  const groups: [string, Audition[]][] = [["Also coming up", g.upcoming], ["Waiting to hear", g.waiting]];
  if (!g.upcoming.length && !g.waiting.length && !g.past.length) return null;
  return (
    <nav aria-label="Your other auditions" className="mt-8 grid gap-8">
      {groups.filter(([, xs]) => xs.length).map(([title, xs]) => (
        <div key={title}>
          <div className="aud-sec-head !mb-1">
            <h2 className="aud-sec-title text-[22px]">{title}</h2>
          </div>
          {xs.map((a) => <Mini key={a.id} a={a} />)}
        </div>
      ))}
      {g.past.length > 0 && (
        <div>
          <button type="button" className="aud-link aud-cap-muted text-[13.5px]" aria-expanded={logbook} onClick={() => setLogbook((v) => !v)}>
            {logbook ? "Hide the logbook" : `The logbook, ${g.past.length} done`}
          </button>
          {logbook && g.past.map((a) => <Mini key={a.id} a={a} />)}
        </div>
      )}
    </nav>
  );
}
