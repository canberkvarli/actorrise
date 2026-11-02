"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { daysUntil, type AfterNotes, type Audition, type AuditionStatus } from "@/lib/auditions";
import { useUpdateAudition } from "@/hooks/useAuditions";
import { useT, type MessageKey } from "@/lib/i18n";
import { useCallbackAction } from "./useCallbackAction";

const PROMPTS: [keyof AfterNotes, MessageKey, MessageKey][] = [
  ["how", "appAuditionsAfter.howLabel", "appAuditionsAfter.howHint"],
  ["differently", "appAuditionsAfter.differentlyLabel", "appAuditionsAfter.differentlyHint"],
  ["room", "appAuditionsAfter.roomLabel", "appAuditionsAfter.roomHint"],
];
const HEARD: [AuditionStatus, MessageKey][] = [["callback", "appAuditionsAfter.callback"], ["booked", "appAuditionsAfter.booked"], ["passed", "appAuditionsAfter.passed"]];
const HEARD_NOTE: Partial<Record<AuditionStatus, MessageKey>> = {
  callback: "appAuditionsAfter.noteCallback",
  booked: "appAuditionsAfter.noteBooked",
  passed: "appAuditionsAfter.notePassed",
};

/** Private notes after the room, and whether they heard back. Folded to one line until the day. */
export function AfterRoom({ a, now }: { a: Audition; now: Date }) {
  const update = useUpdateAudition();
  const t = useT();
  const d = daysUntil(a, now);
  const open = a.scope !== "upcoming" || d === 0;
  const [notes, setNotes] = useState<AfterNotes>(a.after_notes);
  const [unfolded, setUnfolded] = useState(false);
  const callback = useCallbackAction(a);

  function keep(k: keyof AfterNotes) {
    if ((notes[k] ?? "") === (a.after_notes[k] ?? "")) return;
    update.mutate({ id: a.id, after_notes: { ...a.after_notes, ...notes } }, { onError: () => toast.error(t("appAuditionsErr.saveFailed")) });
  }

  return (
    <section id="aud-after" aria-labelledby="aud-after-h" className="scroll-mt-24">
      <div className="aud-sec-head">
        <h2 id="aud-after-h" className="aud-sec-title text-[26px]">{t("appAuditionsAfter.title")}</h2>
        <span className="aud-cap-muted text-[13px]">{t("appAuditionsAfter.private")}</span>
      </div>
      {!open && !unfolded ? (
        <p className="aud-pencil-muted text-[18px]">
          {t("appAuditionsAfter.opensA")}{" "}
          <button type="button" className="aud-link not-italic" onClick={() => setUnfolded(true)}>{t("appAuditionsAfter.writeNow")}</button>{t("appAuditionsAfter.opensB")}
        </p>
      ) : (
        <>
          <div className="aud-card aud-row-in px-4">
            {PROMPTS.map(([k, label, hint]) => (
              <label key={k} className="block border-b border-[var(--aud-rule-soft)] py-3.5 last:border-0">
                <span className="aud-cap-muted block text-[12.5px] font-semibold">{t(label)}</span>
                <textarea
                  rows={k === "how" ? 2 : 1}
                  maxLength={4000}
                  className="mt-1 block w-full resize-y bg-transparent text-[17px] leading-normal outline-none placeholder:font-[family-name:var(--t-display)] placeholder:text-[19px] placeholder:italic placeholder:text-[var(--aud-muted)] focus-visible:outline-none"
                  placeholder={t(hint)}
                  value={notes[k] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [k]: e.target.value }))}
                  onBlur={() => keep(k)}
                />
              </label>
            ))}
          </div>
          {open && (
            <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label={t("appAuditionsAfter.heardBack")}>
              <span className="aud-cap-muted mr-1 text-[13.5px]">{t("appAuditionsAfter.heardBack")}</span>
              {HEARD.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  className="aud-quiet-chip aud-focus px-3.5 py-1.5 text-[13.5px]"
                  aria-pressed={a.status === s}
                  disabled={update.isPending}
                  onClick={() => a.status !== s && update.mutate({ id: a.id, status: s }, {
                    onSuccess: () => toast.success(t(HEARD_NOTE[s]!)),
                    onError: () => toast.error(t("appAuditionsErr.saveFailed")),
                  })}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          )}
          {open && a.status === "callback" && (
            <p className="mt-3 text-[14px]">
              {a.callback_id ? (
                <Link href={`/auditions/${a.callback_id}`} className="aud-link">{t("appAuditionsAfter.openCallback")}</Link>
              ) : (
                <button type="button" className="aud-link" disabled={callback.busy} onClick={callback.go}>
                  {callback.busy ? t("appAuditionsAfter.addingIt") : t("appAuditionsAfter.addCallback")}
                </button>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
