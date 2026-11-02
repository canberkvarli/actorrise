"use client";

import { useId, useState } from "react";

import { KIND_LABEL, type AuditionKind, type Draft, type ThroughKind } from "@/lib/auditions";
import { useT } from "@/lib/i18n";
import { useAuditionWords } from "./useAuditionWords";
import { valuesFromDraft, type DraftValues } from "./draftValues";

export { bodyFromValues, valuesFromDraft, type DraftValues } from "./draftValues";

const LABEL = "aud-dir aud-muted text-[11px] font-semibold uppercase tracking-[0.08em]";
const INPUT = "aud-field mt-1 w-full border border-[var(--t-line-light)] bg-[var(--t-paper)] px-3 py-2.5 text-[16px]";

export function DraftCard({
  draft, initialNotes = "", sidesName, saving, onSave, onCancel, editing,
}: {
  draft: Draft | null;
  initialNotes?: string;
  sidesName: string | null;
  saving: boolean;
  onSave: (v: DraftValues) => void;
  onCancel: () => void;
  /** Edit mode: the saved audition's values. Capture never passes it. */
  editing?: DraftValues;
}) {
  const t = useT();
  const words = useAuditionWords();
  const [v, setV] = useState<DraftValues>(() => {
    if (editing) return editing;
    const base = valuesFromDraft(draft);
    return { ...base, notes: base.notes || initialNotes };
  });
  const unsure = (k: keyof Draft) => {
    const f = draft?.[k] as { value: unknown; confidence: string } | null | undefined;
    return draft && f && typeof f === "object" && "confidence" in f && (f.confidence === "low" || f.value == null) ? "true" : "false";
  };
  const hintId = useId();
  const hint = (k: keyof Draft) => (unsure(k) === "true" ? hintId : undefined);
  const set = (k: keyof DraftValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));
  const whenKey = v.kind === "self_tape" ? "due_at" : "starts_at";

  return (
    <form
      className="aud-prep p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.project.trim()) onSave(v);
      }}
    >
      <p className="aud-title text-2xl">{draft ? t("appAuditionsDraft.checkTitle") : editing ? t("appAuditionsDraft.fixTitle") : t("appAuditionsDraft.addTitle")}</p>
      {draft && <p id={hintId} className="aud-muted mt-1 text-sm">{t("appAuditionsDraft.unsureHint")}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={LABEL}>{t("appAuditionsDraft.project")}</span>
          <input required autoFocus className={INPUT} data-unsure={unsure("project")} aria-describedby={hint("project")} maxLength={200} value={v.project} onChange={set("project")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.role")}</span>
          <input className={INPUT} data-unsure={unsure("role")} aria-describedby={hint("role")} maxLength={200} value={v.role} onChange={set("role")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.kind")}</span>
          <select className={INPUT} data-unsure={unsure("kind")} aria-describedby={hint("kind")} value={v.kind} onChange={set("kind")}>
            {(Object.keys(KIND_LABEL) as AuditionKind[]).map((k) => <option key={k} value={k}>{words.kind(k)}</option>)}
          </select>
        </label>
        <label><span className={LABEL}>{v.kind === "self_tape" ? t("appAuditionsDraft.tapeDue") : t("appAuditionsDraft.when")}</span>
          <input type="datetime-local" className={INPUT} data-unsure={unsure(whenKey)} aria-describedby={hint(whenKey)} value={v.when} onChange={set("when")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.where")}</span>
          <input className={INPUT} data-unsure={unsure("location")} aria-describedby={hint("location")} maxLength={300} value={v.location} onChange={set("location")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.casting")}</span>
          <input className={INPUT} data-unsure={unsure("casting")} aria-describedby={hint("casting")} maxLength={200} value={v.casting} onChange={set("casting")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.askedFor")}</span>
          <input className={INPUT} data-unsure={unsure("material_raw")} aria-describedby={hint("material_raw")} placeholder={t("appAuditionsDraft.askedForPlaceholder")} maxLength={300} value={v.material_raw} onChange={set("material_raw")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.through")}</span>
          <input className={INPUT} data-unsure={unsure("through")} aria-describedby={hint("through")} placeholder={t("appAuditionsDraft.throughPlaceholder")} maxLength={200} value={v.through} onChange={set("through")} />
        </label>
        <label><span className={LABEL}>{t("appAuditionsDraft.whoPutYouUp")}</span>
          <select className={INPUT} value={v.through_kind} onChange={set("through_kind")}>
            <option value="">{t("appAuditionsDraft.notSaying")}</option>
            {(["agent", "manager", "self"] as ThroughKind[]).map((k) => <option key={k} value={k}>{k === "self" ? t("appAuditionsDraft.iDid") : k === "agent" ? t("appAuditionsDraft.myAgent") : t("appAuditionsDraft.myManager")}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2"><span className={LABEL}>{t("appAuditionsDraft.shoots")}</span>
          <input className={INPUT} data-unsure={unsure("shoots")} aria-describedby={hint("shoots")} placeholder={t("appAuditionsDraft.shootsPlaceholder")} maxLength={300} value={v.shoots} onChange={set("shoots")} />
        </label>
        <label className="sm:col-span-2"><span className={LABEL}>{t("appAuditionsDraft.bring")}</span>
          <input className={INPUT} data-unsure={unsure("bring")} aria-describedby={hint("bring")} maxLength={300} value={v.bring} onChange={set("bring")} />
        </label>
        {v.kind === "self_tape" && (
          <label className="sm:col-span-2"><span className={LABEL}>{t("appAuditionsDraft.tapeLink")}</span>
            <input type="url" className={INPUT} maxLength={500} value={v.tape_link} onChange={set("tape_link")} />
          </label>
        )}
        <label className="sm:col-span-2"><span className={LABEL}>{t("appAuditionsDraft.notes")}</span>
          <textarea rows={2} maxLength={4000} className={INPUT} value={v.notes} onChange={set("notes")} />
        </label>
      </div>
      {sidesName && <p className="aud-dir aud-muted mt-3 text-[13px]">{t("appAuditionsDraft.sidesNote", { name: sidesName })}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {saving ? t("appAuditionsDraft.saving") : editing ? t("appAuditionsDraft.saveChanges") : t("appAuditionsDraft.saveIt")}
        </button>
        <button type="button" onClick={onCancel} className="aud-muted text-sm underline-offset-2 hover:underline">{t("appAuditionsDraft.cancel")}</button>
      </div>
      <p className="aud-dir aud-muted mt-2 text-xs">{t("appAuditionsDraft.timesIn", { tz: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>
    </form>
  );
}
