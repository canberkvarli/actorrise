"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  directionsUrl, groupByScope, REMINDER_MOMENTS, safeTz,
  type Audition, type ReminderMoment,
} from "@/lib/auditions";
import { useT, type MessageKey } from "@/lib/i18n";
import { useDeletedAuditions, useUpdateAudition } from "@/hooks/useAuditions";
import { useAuditionWords } from "./useAuditionWords";
import { useRemoveAudition } from "./useRemoveAudition";

const THROUGH_LABEL: Record<"agent" | "manager" | "self", MessageKey> = {
  agent: "appAuditionsAside.throughAgent",
  manager: "appAuditionsAside.throughManager",
  self: "appAuditionsAside.throughSelf",
};

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
  const t = useT();
  const words = useAuditionWords();
  const inPerson = a.kind === "in_person";
  const early = inPerson && a.starts_at ? words.clock(new Date(new Date(a.starts_at).getTime() - 15 * 60_000).toISOString(), a.tz) : null;
  const [place, ...rest] = (a.location ?? "").split(",");

  return (
    <div>
      <dl>
        <Row label={a.kind === "self_tape" ? t("appAuditionsAside.due") : t("appAuditionsAside.when")}>
          {a.when ? words.whenLabel(a) : <span className="aud-cap-muted">{t("appAuditionsAside.noDate")}</span>}
          {early && a.scope === "upcoming" && <span className="aud-cap-muted block text-[13.5px]">{t("appAuditionsAside.beThereBy", { time: early })}</span>}
        </Row>
        {a.location && (
          <Row label={t("appAuditionsAside.where")}>
            {place}
            {rest.length > 0 && <span className="aud-cap-muted block text-[13.5px]">{rest.join(",").trim()}</span>}
            {inPerson && (
              <span className="mt-1 flex flex-wrap gap-x-3 text-[13px]">
                <a className="aud-link" href={directionsUrl(a.location)} target="_blank" rel="noreferrer">{t("appAuditionsAside.directions")}</a>
              </span>
            )}
          </Row>
        )}
        <Row label={t("appAuditionsAside.for")}>
          {a.project}
          <span className="aud-cap-muted block text-[13.5px]">
            {[a.role, words.kind(a.kind)].filter(Boolean).join(" · ")}
          </span>
        </Row>
        {a.casting && <Row label={t("appAuditionsAside.casting")}>{a.casting}</Row>}
        {(a.through || a.through_kind) && (
          <Row label={t("appAuditionsAside.through")}>
            {a.through ?? (a.through_kind === "self" ? t("appAuditionsAside.you") : "")}
            {a.through_kind && a.through && <span className="aud-cap-muted block text-[13.5px]">{t(THROUGH_LABEL[a.through_kind])}</span>}
            {a.through_kind === "self" && !a.through && <span className="aud-cap-muted block text-[13.5px]">{t("appAuditionsAside.throughSelf")}</span>}
          </Row>
        )}
        {a.shoots && <Row label={t("appAuditionsAside.shoots")}>{a.shoots}</Row>}
        {a.material_raw && <Row label={t("appAuditionsAside.askedFor")}>{a.material_raw}</Row>}
        {a.tape_link && (
          <Row label={t("appAuditionsAside.tape")}>
            <a className="aud-link" href={a.tape_link} target="_blank" rel="noreferrer">{t("appAuditionsAside.yourTape")}</a>
          </Row>
        )}
      </dl>
      {a.notes && <p className="aud-cap-muted mt-4 whitespace-pre-wrap break-words text-[13.5px]">{a.notes}</p>}
      <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
        <button type="button" className="aud-link aud-cap-muted" onClick={onEdit}>
          {t("appAuditionsAside.editDetails")}
        </button>
        <RemoveLink a={a} />
      </p>
    </div>
  );
}

export function RemoveLink({ a }: { a: Audition }) {
  const { remove, removing } = useRemoveAudition();
  const t = useT();
  return (
    <button type="button" className="aud-link aud-cap-muted" disabled={removing} onClick={() => remove(a)}>
      {removing ? t("appAuditionsAside.removingIt") : t("appAuditionsAside.remove")}
    </button>
  );
}

const MOMENT_LABEL: Record<ReminderMoment, [MessageKey, MessageKey]> = {
  prep: ["appAuditionsAside.prepLabel", "appAuditionsAside.prepHint"],
  eve: ["appAuditionsAside.eveLabel", "appAuditionsAside.eveHint"],
  after: ["appAuditionsAside.afterLabel", "appAuditionsAside.afterHint"],
};

/** The three emails I can send for this one; each can be switched off. */
export function ReminderLine({ a }: { a: Audition }) {
  const update = useUpdateAudition();
  const t = useT();
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
        toast.error(t("appAuditionsErr.saveFailed"));
      },
    });
  }

  return (
    <div className="mt-8">
      <div className="aud-sec-head !mb-2">
        <h2 className="aud-sec-title text-[22px]">{t("appAuditionsAside.remindTitle")}</h2>
        <span className="aud-cap-muted text-[12.5px]">{t("appAuditionsAside.byEmail")}</span>
      </div>
      <ul className="grid gap-0.5" aria-label={t("appAuditionsAside.reminderEmails")}>
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
                    {m === "prep" && a.kind === "self_tape" ? t("appAuditionsAside.prepTape") : t(label)}
                  </span>
                  <span className="aud-cap-muted block text-[12.5px]">{t(hint)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {picked.length === 0 && <p className="aud-pencil-muted aud-row-in mt-1.5 text-[16px]">{t("appAuditionsAside.noEmails")}</p>}
    </div>
  );
}

function Mini({ a }: { a: Audition }) {
  const t = useT();
  const words = useAuditionWords();
  const d = a.when ? new Date(a.when) : null;
  const tz = safeTz(a.tz);
  const month = d?.toLocaleDateString(words.tag, { month: "short", timeZone: tz }).toLocaleUpperCase(words.tag);
  const day = d?.toLocaleDateString(words.tag, { day: "numeric", timeZone: tz });
  return (
    <Link href={`/auditions/${a.id}`} className="aud-mini aud-focus mt-2.5">
      <span className="aud-mini-stub py-2">
        <span className="aud-cap-muted block text-[10.5px] font-semibold tracking-[0.08em]">
          {a.kind === "self_tape" && a.scope === "upcoming" ? t("appAuditionsAside.dueCaps") : month ?? t("appAuditionsAside.tbd")}
        </span>
        <span className="aud-sec-title block text-[26px]">{day ?? "?"}</span>
      </span>
      <span className="min-w-0 px-3 py-2">
        <span className="block truncate text-[14.5px]">{a.project}</span>
        <span className="aud-cap-muted block truncate text-[12.5px]">
          {[a.role, a.kind === "in_person" ? null : words.kind(a.kind)].filter(Boolean).join(" · ") || " "}
        </span>
      </span>
    </Link>
  );
}

/** Every other audition, quietly. Never the open one. */
export function OtherAuditions({ list, openId }: { list: Audition[]; openId: number }) {
  const g = groupByScope(list.filter((a) => a.id !== openId));
  const [logbook, setLogbook] = useState(false);
  const t = useT();
  const groups: [string, Audition[]][] = [[t("appAuditionsAside.alsoComingUp"), g.upcoming], [t("appAuditionsAside.waitingToHear"), g.waiting]];
  return (
    <nav aria-label={t("appAuditionsAside.otherAuditions")} className="mt-8 grid gap-8 empty:hidden">
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
            {logbook ? t("appAuditionsAside.hideLogbook") : t("appAuditionsAside.logbook", { n: g.past.length })}
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

/**
 * What was removed in the last 30 days, one tap from coming back. Folded in
 * the file's side column; open on the empty page, where it's the only way back.
 */
export function RecentlyDeleted({ startOpen = false, className = "" }: { startOpen?: boolean; className?: string }) {
  const { data = [] } = useDeletedAuditions();
  const { bringBack, restoring } = useRemoveAudition();
  const [open, setOpen] = useState(startOpen);
  const t = useT();
  if (data.length === 0) return null;
  return (
    <div className={`aud-row-in ${className}`}>
      <button type="button" className="aud-link aud-cap-muted text-[13.5px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? t("appAuditionsAside.hideDeleted") : t("appAuditionsAside.recentlyDeleted", { n: data.length })}
      </button>
      <div className="aud-fold" data-open={open ? "true" : "false"} inert={!open}>
        <ul className="grid gap-2 pt-2.5">
          {data.map((a) => (
            <li key={a.id} className="aud-gone flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{a.project}</span>
                <span className="aud-cap-muted block text-[12px]">{t("appAuditionsAside.goneIn", { n: daysLeft(a.deleted_at) })}</span>
              </span>
              <button
                type="button"
                className="aud-link shrink-0 text-[13px] font-semibold"
                disabled={restoring}
                onClick={() => bringBack(a.id, a.project)}
              >
                {t("appAuditionsAside.bringBack")}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
