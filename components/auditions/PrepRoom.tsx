"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { countdown, STATUS_LABEL, STATUS_ORDER, whenLabel, type Audition, type AuditionStatus } from "@/lib/auditions";
import { useDeleteAudition, useLogOutcome, useUpdateAudition } from "@/hooks/useAuditions";
import { useScript } from "@/hooks/useScripts";
import { DraftCard } from "./DraftCard";
import { patchFromValues, valuesFromAudition, type DraftValues } from "./draftValues";

/** One voice for a logged outcome, whether it came from here or the email (AuditionsShell's ?logged=). */
export const OUTCOME_NOTE: Record<"good" | "callback" | "no", string> = {
  good: "Got it, it felt good. Fingers crossed for you.",
  callback: "A callback! I moved it to Callback. Go get it.",
  no: "Got it. Not this time, on to the next one.",
};

const SAVE_FAILED = "That didn't save. Try again in a moment.";

function errMessage(e: unknown): string {
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" && m && !m.startsWith("[object") ? m : "That didn't save. Check the fields and try again.";
}

export function PrepRoom({ a, now }: { a: Audition; now: Date }) {
  const router = useRouter();
  const c = countdown(a.when, now, a.tz);
  // Digits and "?" get the big display size. Words ("Now", "Tomorrow", "Oct 12") stay at a size
  // that fits the 150px stub: "Now" at text-8xl is 148px, "Tomorrow" at text-4xl is 130px.
  const big = /^\d+$/.test(c.n) || c.n === "?";
  const update = useUpdateAudition();
  const outcome = useLogOutcome();
  const del = useDeleteAudition();
  // Which audition the question was answered for this session, so it goes away once answered.
  const [answeredFor, setAnsweredFor] = useState<number | null>(null);
  // Same trick for the edit form: open for one audition, so picking another ticket closes it.
  const [editingFor, setEditingFor] = useState<number | null>(null);
  const save = (body: Record<string, unknown>) => update.mutate({ id: a.id, ...body }, { onError: () => toast.error(SAVE_FAILED) });
  // Sides go up in the background, so the script can still be reading when the prep room opens.
  // useScript polls while it is, and /practice handles a reading script on its own.
  const { data: sides } = useScript(a.user_script_id);
  const sidesReading = sides?.processing_status === "processing" || sides?.processing_status === "pending";
  const sidesFailed = sides?.processing_status === "failed";
  const rows: [string, string | null][] = [
    ["Where", a.location], ["Casting", a.casting], ["Bring", a.bring], ["Asked for", a.material_raw],
  ];
  const past = a.scope !== "upcoming";

  function sidesNote(runs: number): string {
    if (sidesReading) return "Sides are still loading";
    if (sidesFailed) return "Those sides didn't read. Open them to try again";
    return runs === 0 ? "not run yet" : `${runs} ${runs === 1 ? "run" : "runs"}`;
  }

  function saveEdit(v: DraftValues) {
    const patch = patchFromValues(a, v);
    if (Object.keys(patch).length === 0) { setEditingFor(null); return; }
    const moved = "starts_at" in patch || "due_at" in patch;
    update.mutate({ id: a.id, ...patch }, {
      onSuccess: () => {
        setEditingFor(null);
        toast.success(moved && a.reminders_on ? "Fixed. Your reminders moved with the new time." : "Fixed. Thanks for catching that.");
      },
      onError: (e) => toast.error(errMessage(e)),
    });
  }

  if (editingFor === a.id) {
    return (
      <DraftCard
        draft={null}
        editing={valuesFromAudition(a)}
        sidesName={null}
        saving={update.isPending}
        onSave={saveEdit}
        onCancel={() => setEditingFor(null)}
      />
    );
  }

  return (
    <article className="aud-prep grid sm:grid-cols-[150px_1fr]">
      <div className="aud-prep-stub bg-primary text-primary-foreground flex min-w-0 items-center gap-4 border-dashed px-4 py-3 max-sm:border-b-2 sm:flex-col sm:items-center sm:justify-start sm:border-r-2 sm:py-6 sm:text-center">
        <div className="min-w-0 shrink-0 sm:w-full">
          <p className={big ? "aud-stub-n text-6xl sm:text-8xl" : "aud-stub-n break-words text-3xl"}>{c.n}</p>
          {c.unit && <p className="aud-dir text-[11px] uppercase tracking-[0.1em]">{c.unit}</p>}
        </div>
        <p className="aud-dir min-w-0 text-[11.5px] leading-relaxed sm:mt-4">{whenLabel(a)}</p>
      </div>

      <div className="min-w-0 p-4 sm:p-6">
        <p className="aud-dir text-[11px] uppercase tracking-[0.08em]">{STATUS_LABEL[a.status]}</p>
        <h1 className="aud-title break-words text-3xl sm:text-4xl">{a.project}</h1>
        {a.role && <p className="aud-muted mt-0.5 text-sm">{a.role}</p>}

        <dl className="mt-3">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="aud-row aud-dir grid grid-cols-[84px_1fr] py-1.5 text-[12.5px]">
              <dt>{k}</dt><dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>

        {a.prep && (
          <ol className="mt-4 grid gap-2.5">
            {a.prep.steps.map((s) => (
              <li key={s.key} className="aud-step grid grid-cols-[22px_1fr_auto] items-center gap-3 px-3 py-2.5">
                <span className="aud-box" data-done={s.done ? "true" : "false"} aria-label={s.done ? "done" : "not yet"} />
                <span className="min-w-0 text-sm">
                  {s.label}
                  {s.key === "sides" && (
                    <span className="aud-dir aud-muted block text-[11px]">{sidesNote(a.prep!.runs)}</span>
                  )}
                </span>
                {s.href && (
                  <Link
                    href={s.href}
                    onClick={() => s.key !== "bring" && trackEvent("audition_prep_started", { audition_id: a.id, kind: s.key === "sides" ? "sides" : "monologue" })}
                    className={`t-cta whitespace-nowrap px-3 py-1.5 text-[12.5px] font-semibold ${s.done ? "border border-current" : "bg-primary text-primary-foreground"}`}
                  >
                    {s.key === "sides"
                      ? sidesReading ? "Open them" : a.prep!.runs ? "Run it again" : "Run it"
                      : s.key === "piece" ? "See them" : "Your collection"}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}

        {past && a.status !== "booked" && a.status !== "passed" && answeredFor !== a.id && (
          <div className="mt-5">
            <p className="text-sm">How did it go?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {([["good", "Felt good"], ["callback", "Got a callback"], ["no", "Not this time"]] as const).map(([o, label]) => (
                <button key={o} type="button" className="aud-chip px-2.5 py-1" disabled={outcome.isPending}
                  onClick={() => outcome.mutate({ id: a.id, outcome: o }, {
                    onSuccess: () => { setAnsweredFor(a.id); toast.success(OUTCOME_NOTE[o]); },
                    onError: () => toast.error(SAVE_FAILED),
                  })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {STATUS_ORDER.map((s: AuditionStatus) => (
            <button key={s} type="button" className="aud-chip px-2 py-1" data-tone={s === a.status ? "gel" : undefined}
              aria-pressed={s === a.status} onClick={() => s !== a.status && save({ status: s })}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="aud-dir aud-muted mt-5 flex flex-wrap items-center gap-4 text-[11.5px]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={a.reminders_on} onChange={(e) => save({ reminders_on: e.target.checked })} />
            email me about this one
          </label>
          <button type="button" className="underline underline-offset-2" onClick={() => setEditingFor(a.id)}>
            fix the details
          </button>
          {a.tape_link && <a href={a.tape_link} target="_blank" rel="noreferrer" className="underline">tape</a>}
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            disabled={del.isPending}
            onClick={() => {
              if (!window.confirm(`Take ${a.project} off your rail?`)) return;
              del.mutate(a.id, { onSuccess: () => router.push("/auditions"), onError: () => toast.error(SAVE_FAILED) });
            }}
          >
            remove
          </button>
        </div>
        {a.notes && <p className="aud-muted mt-4 whitespace-pre-wrap break-words text-sm">{a.notes}</p>}
      </div>
    </article>
  );
}
