"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  clockIn, directionsUrl, groupByScope, KIND_LABEL, REMINDER_MOMENTS, safeTz, whenLabel,
  type Audition, type ReminderMoment,
} from "@/lib/auditions";
import { useDeletedAuditions, useUpdateAudition } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";
import { useRemoveAudition } from "./useRemoveAudition";

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
export function FileDetails({ a, onEdit }: { a: Audition; onEdit: () => void }) {
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
      {a.notes && <p className="aud-cap-muted mt-4 whitespace-pre-wrap break-words text-[13.5px]">{a.notes}</p>}
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
        <button type="button" className="aud-link aud-cap-muted" onClick={onEdit}>
          Edit details
        </button>
        <RemoveLink a={a} />
      </p>
    </div>
  );
}

export function RemoveLink({ a }: { a: Audition }) {
  const { remove, removing } = useRemoveAudition();
  return (
    <button type="button" className="aud-link aud-cap-muted" disabled={removing} onClick={() => remove(a)}>
      {removing ? "Removing it" : "Remove this audition"}
    </button>
  );
}

const MOMENT_LABEL: Record<ReminderMoment, [string, string]> = {
  prep: ["Three days out", "6 pm, what to work on"],
  eve: ["The night before", "7 pm, where and when"],
  after: ["The morning after", "9 am, how did it go?"],
};

/** The three emails I can send for this one; each can be switched off. */
export function ReminderLine({ a }: { a: Audition }) {
  const update = useUpdateAudition();
  const saved = a.reminders_on ? a.reminder_moments : [];
  const [picked, setPicked] = useState<ReminderMoment[]>(saved);
  const [seen, setSeen] = useState(saved);
  if (seen !== saved && seen.join() !== saved.join()) {
    setSeen(saved);
    setPicked(saved);
  }
  if (a.scope !== "upcoming") return null;

  function flip(m: ReminderMoment) {
    const before = picked;
    const next = REMINDER_MOMENTS.filter((x) => (x === m ? !picked.includes(x) : picked.includes(x)));
    setPicked(next);
    update.mutate({ id: a.id, reminder_moments: next, reminders_on: next.length > 0 }, {
      onError: () => {
        setPicked(before);
        toast.error(SAVE_FAILED);
      },
    });
  }

  return (
    <div className="mt-8">
      <div className="aud-sec-head !mb-2">
        <h2 className="aud-sec-title text-[22px]">I&apos;ll remind you</h2>
        <span className="aud-cap-muted text-[12.5px]">by email</span>
      </div>
      <ul className="grid gap-0.5" aria-label="Reminder emails">
        {REMINDER_MOMENTS.map((m) => {
          const on = picked.includes(m);
          const [label, hint] = MOMENT_LABEL[m];
          return (
            <li key={m}>
              <label className="aud-remind-row flex cursor-pointer items-start gap-3 py-1.5" data-on={on ? "true" : "false"}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => flip(m)} />
                <span className="aud-check mt-0.5" data-on={on ? "true" : "false"} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[14.5px] leading-snug">
                    {m === "prep" && a.kind === "self_tape" ? "Three days before it's due" : label}
                  </span>
                  <span className="aud-cap-muted block text-[12.5px]">{hint}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {picked.length === 0 && <p className="aud-pencil-muted aud-row-in mt-1.5 text-[16px]">(no emails for this one.)</p>}
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
  return (
    <nav aria-label="Your other auditions" className="mt-8 grid gap-8 empty:hidden">
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
          <div className="aud-fold" data-open={logbook ? "true" : "false"} inert={!logbook}>
            <div>{g.past.map((a) => <Mini key={a.id} a={a} />)}</div>
          </div>
        </div>
      )}
      <RecentlyDeleted />
    </nav>
  );
}

function daysLeft(deletedAt: string): number {
  const gone = new Date(deletedAt).getTime() + 30 * 86_400_000;
  return Math.max(1, Math.ceil((gone - Date.now()) / 86_400_000));
}

/** What was removed in the last 30 days, one tap from coming back. */
function RecentlyDeleted() {
  const { data = [] } = useDeletedAuditions();
  const { bringBack, restoring } = useRemoveAudition();
  const [open, setOpen] = useState(false);
  if (data.length === 0) return null;
  return (
    <div>
      <button type="button" className="aud-link aud-cap-muted text-[13.5px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Hide recently deleted" : `Recently deleted, ${data.length}`}
      </button>
      <div className="aud-fold" data-open={open ? "true" : "false"} inert={!open}>
        <ul className="grid gap-2 pt-2.5">
          {data.map((a) => (
            <li key={a.id} className="aud-gone flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{a.project}</span>
                <span className="aud-cap-muted block text-[12px]">gone for good in {daysLeft(a.deleted_at)} days</span>
              </span>
              <button
                type="button"
                className="aud-link shrink-0 text-[13px] font-semibold"
                disabled={restoring}
                onClick={() => bringBack(a.id, a.project)}
              >
                Bring it back
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
