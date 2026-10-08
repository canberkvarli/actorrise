"use client";

import { useState } from "react";
import { toast } from "sonner";

import { daysUntil, type AfterNotes, type Audition, type AuditionStatus } from "@/lib/auditions";
import { useUpdateAudition } from "@/hooks/useAuditions";
import { SAVE_FAILED } from "./SidesSection";

const PROMPTS: [keyof AfterNotes, string, string][] = [
  ["how", "How did it go?", "(write it while it's fresh)"],
  ["differently", "What I'd do differently", "(the note you'd give yourself)"],
  ["room", "Who was in the room", "(names, and any redirect they gave you)"],
];
const HEARD: [AuditionStatus, string][] = [["callback", "Callback"], ["booked", "Booked"], ["passed", "Not this time"]];
const HEARD_NOTE: Partial<Record<AuditionStatus, string>> = {
  callback: "A callback! Go get it.",
  booked: "You booked it. Congratulations.",
  passed: "Got it. Not this time, on to the next one.",
};

/** Private notes after the room, and whether they heard back. Folded to one line until the day. */
export function AfterRoom({ a, now }: { a: Audition; now: Date }) {
  const update = useUpdateAudition();
  const d = daysUntil(a, now);
  const open = a.scope !== "upcoming" || d === 0;
  const [notes, setNotes] = useState<AfterNotes>(a.after_notes);
  const [unfolded, setUnfolded] = useState(false);

  function keep(k: keyof AfterNotes) {
    if ((notes[k] ?? "") === (a.after_notes[k] ?? "")) return;
    update.mutate({ id: a.id, after_notes: { ...a.after_notes, ...notes } }, { onError: () => toast.error(SAVE_FAILED) });
  }

  return (
    <section id="aud-after" aria-labelledby="aud-after-h" className="scroll-mt-24">
      <div className="aud-sec-head">
        <h2 id="aud-after-h" className="aud-sec-title text-[26px]">After the room</h2>
        <span className="aud-cap-muted text-[13px]">only you see this</span>
      </div>
      {!open && !unfolded ? (
        <p className="aud-pencil-muted text-[18px]">
          (this opens on the day.{" "}
          <button type="button" className="aud-link not-italic" onClick={() => setUnfolded(true)}>write something now</button>)
        </p>
      ) : (
        <>
          <div className="aud-card px-4">
            {PROMPTS.map(([k, label, hint]) => (
              <label key={k} className="block border-b border-[var(--aud-rule-soft)] py-3.5 last:border-0">
                <span className="aud-cap-muted block text-[12.5px] font-semibold">{label}</span>
                <textarea
                  rows={k === "how" ? 2 : 1}
                  maxLength={4000}
                  className="mt-1 block w-full resize-y bg-transparent text-[15.5px] leading-normal outline-none placeholder:font-[family-name:var(--t-display)] placeholder:text-[17px] placeholder:italic placeholder:text-[var(--aud-muted)] focus-visible:outline-none"
                  placeholder={hint}
                  value={notes[k] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [k]: e.target.value }))}
                  onBlur={() => keep(k)}
                />
              </label>
            ))}
          </div>
          {open && (
            <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Heard back?">
              <span className="aud-cap-muted mr-1 text-[13.5px]">Heard back?</span>
              {HEARD.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  className="aud-quiet-chip aud-focus px-3.5 py-1.5 text-[13.5px]"
                  aria-pressed={a.status === s}
                  disabled={update.isPending}
                  onClick={() => a.status !== s && update.mutate({ id: a.id, status: s }, {
                    onSuccess: () => toast.success(HEARD_NOTE[s]),
                    onError: () => toast.error(SAVE_FAILED),
                  })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
