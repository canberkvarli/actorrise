"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { countdown, STATUS_LABEL, STATUS_ORDER, whenLabel, type Audition, type AuditionPiece, type AuditionStatus } from "@/lib/auditions";
import { useAddPiece, useDeleteAudition, useLogOutcome, useRemovePiece, useUpdateAudition } from "@/hooks/useAuditions";
import { useBookmarks } from "@/hooks/useBookmarks";
import { useScript } from "@/hooks/useScripts";
import { DraftCard } from "./DraftCard";
import { errMessage, patchFromValues, valuesFromAudition, type DraftValues } from "./draftValues";

/** One voice for a logged outcome, whether it came from here or the email (AuditionsShell's ?logged=). */
export const OUTCOME_NOTE: Record<"good" | "callback" | "no", string> = {
  good: "Got it, it felt good. Fingers crossed for you.",
  callback: "A callback! I moved it to Callback. Go get it.",
  no: "Got it. Not this time, on to the next one.",
};

const SAVE_FAILED = "That didn't save. Try again in a moment.";

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
  // Closing the form hands focus back to the button that opened it.
  const fixButton = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (editingFor === null && refocus.current) {
      refocus.current = false;
      fixButton.current?.focus();
    }
  }, [editingFor]);
  function closeEdit() {
    refocus.current = true;
    setEditingFor(null);
  }
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
    if (Object.keys(patch).length === 0) { closeEdit(); return; }
    const moved = patch.starts_at != null || patch.due_at != null;
    update.mutate({ id: a.id, ...patch }, {
      onSuccess: () => {
        closeEdit();
        toast.success(moved && a.reminders_on ? "Got it. Any reminders still to come follow the new time." : "Fixed. Thanks for catching that.");
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
        onCancel={closeEdit}
      />
    );
  }

  return (
    <article className="aud-prep grid sm:grid-cols-[150px_1fr]">
      <div className="aud-prep-stub bg-primary text-primary-foreground flex min-w-0 items-center gap-4 border-dashed px-4 py-3 max-sm:border-b-2 sm:flex-col sm:items-center sm:justify-start sm:border-r-2 sm:py-6 sm:text-center">
        <div className="min-w-0 shrink-0 sm:w-full">
          <p className={big ? "aud-stub-n text-6xl sm:text-8xl" : "aud-stub-n break-words text-3xl"}>{c.n}</p>
          {c.unit && <p className="aud-dir text-[11px] font-semibold uppercase tracking-[0.12em]">{c.unit}</p>}
        </div>
        <p className="aud-dir min-w-0 text-[13px] font-medium leading-snug sm:mt-4">{whenLabel(a)}</p>
      </div>

      <div className="min-w-0 p-4 sm:p-6">
        <p className="aud-dir aud-muted text-[11px] font-semibold uppercase tracking-[0.1em]">{STATUS_LABEL[a.status]}</p>
        <h1 className="aud-title break-words text-3xl sm:text-4xl">{a.project}</h1>
        {a.role && <p className="aud-muted mt-0.5 text-sm">{a.role}</p>}

        <dl className="mt-3">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="aud-row aud-dir grid grid-cols-[84px_1fr] items-baseline py-1.5 text-sm">
              <dt>{k}</dt><dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>

        {a.prep && (
          <ol className="mt-4 grid gap-2.5">
            {a.prep.steps.map((s) => (
              <li key={s.key} className={`aud-step grid grid-cols-[22px_1fr_auto] gap-3 px-3 py-2.5 ${hasPieces(s.key) ? "items-start" : "items-center"}`}>
                <span className="aud-box" data-done={s.done ? "true" : "false"} aria-label={s.done ? "done" : "not yet"} />
                <span className="min-w-0 text-sm">
                  {s.label}
                  {s.key === "sides" && (
                    <span className="aud-dir aud-muted block text-[12.5px]">{sidesNote(a.prep!.runs)}</span>
                  )}
                  {hasPieces(s.key) && <Pieces a={a} />}
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
        {/* A sides-only audition has no piece step, but the actor may still be bringing a monologue. */}
        {a.prep && !a.prep.steps.some((s) => hasPieces(s.key)) && (
          <div className="mt-3 px-3 text-sm">
            <Pieces a={a} label="Bringing a monologue too?" />
          </div>
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

        <div className="aud-dir aud-muted mt-5 flex flex-wrap items-center gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={a.reminders_on} onChange={(e) => save({ reminders_on: e.target.checked })} />
            email me about this one
          </label>
          <button ref={fixButton} type="button" className="underline underline-offset-2" onClick={() => setEditingFor(a.id)}>
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

const hasPieces = (key: string) => key === "piece" || key === "bring";

function pieceName(p: AuditionPiece): string {
  if (!p.monologue_id) return "A scene";
  if (!p.title) return "A monologue";
  return p.character && !p.title.includes(p.character) ? `${p.title}, ${p.character}` : p.title;
}

/** What the actor is bringing: the pieces already on this audition, and one tap to add a saved monologue. */
function Pieces({ a, label }: { a: Audition; label?: string }) {
  const add = useAddPiece();
  const remove = useRemovePiece();
  const { data: saved } = useBookmarks();
  const attached = new Set(a.pieces.map((p) => p.monologue_id));
  const choices = (saved ?? []).filter((m) => !attached.has(m.id));
  if (label && a.pieces.length === 0 && choices.length === 0) return null;

  return (
    <span className="mt-1.5 block">
      {label && <span className="block">{label}</span>}
      {a.pieces.length > 0 && (
        <span className="grid gap-1">
          {a.pieces.map((p) => (
            <span key={p.id} className="aud-dir flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px]">
              <span className="min-w-0 break-words">
                {pieceName(p)}
                {p.play_title && <span className="aud-muted"> from {p.play_title}</span>}
              </span>
              {p.monologue_id && (
                <Link
                  href={`/monologue/${p.monologue_id}/work`}
                  onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: "monologue" })}
                  className="underline underline-offset-2"
                >
                  work on it
                </Link>
              )}
              <button
                type="button"
                className="aud-muted underline underline-offset-2"
                disabled={remove.isPending}
                aria-label={`Take ${pieceName(p)} off this audition`}
                onClick={() => remove.mutate({ id: a.id, piece_id: p.id }, { onError: () => toast.error(SAVE_FAILED) })}
              >
                take it off
              </button>
            </span>
          ))}
        </span>
      )}
      {choices.length > 0 && (
        <select
          className="aud-dir mt-1.5 max-w-full border border-current bg-transparent px-1.5 py-1 text-[13px]"
          aria-label="Bring a monologue you saved"
          value=""
          disabled={add.isPending}
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!id) return;
            add.mutate({ id: a.id, monologue_id: id }, {
              onSuccess: () => toast.success("Got it. That's the one you're bringing."),
              onError: () => toast.error(SAVE_FAILED),
            });
          }}
        >
          <option value="">{a.pieces.length ? "Add another one you saved" : "Pick one you saved"}</option>
          {choices.map((m) => (
            <option key={m.id} value={m.id}>
              {m.character_name}, {m.play_title}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
