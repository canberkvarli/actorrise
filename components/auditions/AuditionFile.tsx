"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { trackEvent } from "@/lib/events";
import { eyebrow, KIND_LABEL, nextStep, sectionOrder, whenSentence, type Audition, type FileSection } from "@/lib/auditions";
import { useUpdateAudition } from "@/hooks/useAuditions";
import { AfterRoom } from "./AfterRoom";
import { AskMe } from "./AskMe";
import { BringList } from "./BringList";
import { DraftCard } from "./DraftCard";
import { errMessage, patchFromValues, valuesFromAudition, type DraftValues } from "./draftValues";
import { FileDetails, OtherAuditions, ReminderLine, RemoveLink } from "./FileAside";
import { SAVE_FAILED, SidesSection, useAddSides } from "./SidesSection";
import { useCallbackAction } from "./useCallbackAction";

/** One voice for a logged outcome from the morning-after email (AuditionsShell's ?logged=). */
export const OUTCOME_NOTE: Record<"good" | "callback" | "no", string> = {
  good: "Got it, it felt good. Fingers crossed for you.",
  callback: "A callback! I moved it to Callback. Go get it.",
  no: "Got it. Not this time, on to the next one.",
};

const PILL = "aud-pill aud-focus bg-primary text-primary-foreground inline-flex h-12 items-center justify-center px-6 text-[15.5px] max-sm:w-full";

/** The one orange button. Everything else on the page is quieter than this. */
function Primary({ a, now }: { a: Audition; now: Date }) {
  const step = nextStep(a, now);
  const add = useAddSides(a);
  const callback = useCallbackAction(a);
  if (!step) return null;
  if (step.kind === "callback") {
    return (
      <button type="button" className={PILL} disabled={callback.busy} onClick={callback.go}>
        {callback.busy ? "Adding it" : step.label}
      </button>
    );
  }
  if (step.kind === "link") {
    return (
      <Link
        href={step.href}
        className={PILL}
        onClick={() => trackEvent("audition_prep_started", { audition_id: a.id, kind: step.step === "sides" ? "sides" : "monologue" })}
      >
        {step.label}
      </Link>
    );
  }
  if (step.kind === "upload") {
    return (
      <>
        <button type="button" className={PILL} disabled={add.busy} onClick={add.pick}>
          {add.busy ? "Adding them" : step.label}
        </button>
        {add.field}
      </>
    );
  }
  return (
    <button
      type="button"
      className={PILL}
      onClick={() => {
        const el = document.getElementById(`aud-${step.target}`);
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        el?.querySelector<HTMLElement>("textarea, input:not([type=checkbox])")?.focus({ preventScroll: true });
      }}
    >
      {step.label}
    </button>
  );
}

function Edit({ a, onClose }: { a: Audition; onClose: () => void }) {
  const update = useUpdateAudition();

  function save(v: DraftValues) {
    const patch = patchFromValues(a, v);
    if (Object.keys(patch).length === 0) return onClose();
    const moved = patch.starts_at != null || patch.due_at != null;
    update.mutate({ id: a.id, ...patch }, {
      onSuccess: () => {
        onClose();
        toast.success(moved && a.reminders_on ? "Got it. Any reminders still to come follow the new time." : "Fixed. Thanks for catching that.");
      },
      onError: (e) => toast.error(errMessage(e)),
    });
  }

  return (
    <div className="aud-file-in mx-auto max-w-2xl">
      <DraftCard draft={null} editing={valuesFromAudition(a)} sidesName={null} saving={update.isPending} onSave={save} onCancel={onClose} />
      <div className="aud-cap-muted mt-5 flex flex-wrap items-center gap-5 text-[13.5px]">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={a.reminders_on}
            onChange={(e) => {
              const on = e.target.checked;
              // Back on with every moment switched off would still send nothing: start again from all three.
              const reset = on && a.reminder_moments.length === 0 ? { reminder_moments: null } : {};
              update.mutate({ id: a.id, reminders_on: on, ...reset }, { onError: () => toast.error(SAVE_FAILED) });
            }}
          />
          email me about this one
        </label>
        <RemoveLink a={a} />
      </div>
    </div>
  );
}

/**
 * One audition as its file: what it is and the next thing to do up top, then
 * the work in the order you live it (the sides, what to bring, after the
 * room, ask me), and the facts in a quiet column beside it.
 */
export function AuditionFile({ a, list, now, next = false, startEditing = false }: {
  a: Audition; list: Audition[]; now: Date; next?: boolean; startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  if (editing) return <Edit a={a} onClose={() => setEditing(false)} />;

  const role = [a.role, a.kind !== "in_person" ? KIND_LABEL[a.kind] : null].filter(Boolean).join(" · ");
  const when = whenSentence(a);
  const place = a.location?.split(",")[0];
  const sections: Record<FileSection, React.ReactNode> = {
    sides: <SidesSection a={a} />,
    bring: <BringList a={a} />,
    after: <AfterRoom a={a} now={now} />,
    ask: <AskMe a={a} />,
  };

  return (
    <article className="aud-file-in grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">
        <p className="aud-eyebrow">{eyebrow(a, now, next)}</p>
        <h1 className="aud-file-title mt-3 break-words text-[52px] md:text-[76px]">{a.project}</h1>
        {role && <p className="mt-3 text-[17px] md:text-[19px]">{role}</p>}
        {(when || place) && (
          <p className="mt-1 text-[17px] md:text-[19px]">
            {when}
            {place && <span className="aud-cap-muted">{when ? " · " : ""}{place}</span>}
          </p>
        )}
        <div className="mt-7">
          <Primary a={a} now={now} />
        </div>

        {sectionOrder(a, now).map((k) => {
          const node = sections[k];
          return node ? <div key={k} className="mt-10 empty:hidden">{node}</div> : null;
        })}
      </div>

      <aside className="min-w-0 lg:pt-1">
        <FileDetails a={a} onEdit={() => setEditing(true)} />
        <ReminderLine a={a} />
        <OtherAuditions list={list} openId={a.id} />
      </aside>
    </article>
  );
}
