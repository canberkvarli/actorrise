"use client";

import { useId, useState } from "react";

import { KIND_LABEL, type AuditionKind, type Draft } from "@/lib/auditions";
import { valuesFromDraft, type DraftValues } from "./draftValues";

export { bodyFromValues, valuesFromDraft, type DraftValues } from "./draftValues";

const LABEL = "aud-dir aud-muted text-[10.5px] uppercase tracking-[0.06em]";
const INPUT = "aud-field mt-1 w-full border border-[var(--t-line-light)] bg-[var(--t-paper)] px-2.5 py-2 text-sm";

export function DraftCard({
  draft, initialNotes = "", quotaHit = false, sidesName, saving, onSave, onCancel, editing,
}: {
  draft: Draft | null;
  initialNotes?: string;
  quotaHit?: boolean;
  sidesName: string | null;
  saving: boolean;
  onSave: (v: DraftValues) => void;
  onCancel: () => void;
  /** Edit mode: the saved audition's values. Capture never passes it. */
  editing?: DraftValues;
}) {
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
      <p className="aud-title text-2xl">{draft ? "Check what I read" : editing ? "Fix the details" : "Add an audition"}</p>
      {quotaHit && (
        <p role="status" className="aud-muted mt-1 text-sm">
          You&apos;re out of free reads this month. Fill it in yourself and it still saves, or go Plus for unlimited reads.
        </p>
      )}
      {draft && <p id={hintId} className="aud-muted mt-1 text-sm">The outlined ones I wasn&apos;t sure about.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={LABEL}>Project</span>
          <input required autoFocus className={INPUT} data-unsure={unsure("project")} aria-describedby={hint("project")} maxLength={200} value={v.project} onChange={set("project")} />
        </label>
        <label><span className={LABEL}>Role</span>
          <input className={INPUT} data-unsure={unsure("role")} aria-describedby={hint("role")} maxLength={200} value={v.role} onChange={set("role")} />
        </label>
        <label><span className={LABEL}>Kind</span>
          <select className={INPUT} data-unsure={unsure("kind")} aria-describedby={hint("kind")} value={v.kind} onChange={set("kind")}>
            {(Object.keys(KIND_LABEL) as AuditionKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label><span className={LABEL}>{v.kind === "self_tape" ? "Tape due" : "When"}</span>
          <input type="datetime-local" className={INPUT} data-unsure={unsure(whenKey)} aria-describedby={hint(whenKey)} value={v.when} onChange={set("when")} />
        </label>
        <label><span className={LABEL}>Where</span>
          <input className={INPUT} data-unsure={unsure("location")} aria-describedby={hint("location")} maxLength={300} value={v.location} onChange={set("location")} />
        </label>
        <label><span className={LABEL}>Casting</span>
          <input className={INPUT} data-unsure={unsure("casting")} aria-describedby={hint("casting")} maxLength={200} value={v.casting} onChange={set("casting")} />
        </label>
        <label><span className={LABEL}>What they asked for</span>
          <input className={INPUT} data-unsure={unsure("material_raw")} aria-describedby={hint("material_raw")} placeholder="1 min contemporary comedic" maxLength={300} value={v.material_raw} onChange={set("material_raw")} />
        </label>
        <label className="sm:col-span-2"><span className={LABEL}>Bring</span>
          <input className={INPUT} data-unsure={unsure("bring")} aria-describedby={hint("bring")} maxLength={300} value={v.bring} onChange={set("bring")} />
        </label>
        {v.kind === "self_tape" && (
          <label className="sm:col-span-2"><span className={LABEL}>Tape link (optional)</span>
            <input type="url" className={INPUT} maxLength={500} value={v.tape_link} onChange={set("tape_link")} />
          </label>
        )}
        <label className="sm:col-span-2"><span className={LABEL}>Notes</span>
          <textarea rows={2} maxLength={4000} className={INPUT} value={v.notes} onChange={set("notes")} />
        </label>
      </div>
      {sidesName && <p className="aud-dir aud-muted mt-3 text-xs">Sides: {sidesName}. They&apos;ll load into ScenePartner when you save.</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
          {saving ? "Saving" : editing ? "Save changes" : "Save it"}
        </button>
        <button type="button" onClick={onCancel} className="aud-muted text-sm underline-offset-2 hover:underline">Cancel</button>
      </div>
      <p className="aud-dir aud-muted mt-2 text-[11px]">Times are in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
    </form>
  );
}
