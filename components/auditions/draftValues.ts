// Pure helpers behind DraftCard: form values from a parse or a saved audition, and the body back out.
// Relative import so vitest (no path aliases) can load this file on its own.
import { changedFields, fromLocalInput, toLocalInput, type Audition, type AuditionKind, type Draft } from "../../lib/auditions";

export type DraftValues = {
  project: string; role: string; kind: AuditionKind; when: string; location: string; casting: string;
  material_raw: string; bring: string; notes: string; tape_link: string;
};

export function valuesFromDraft(d: Draft | null): DraftValues {
  const v = (f?: { value: string | null }) => f?.value ?? "";
  const kind = (d?.kind.value ?? "in_person") as AuditionKind;
  return {
    project: v(d?.project), role: v(d?.role), kind,
    when: toLocalInput(kind === "self_tape" ? d?.due_at.value ?? d?.starts_at.value ?? null : d?.starts_at.value ?? null),
    location: v(d?.location), casting: v(d?.casting), material_raw: v(d?.material_raw), bring: v(d?.bring),
    notes: v(d?.notes), tape_link: "",
  };
}

export function bodyFromValues(v: DraftValues): Record<string, unknown> {
  const iso = fromLocalInput(v.when);
  return {
    project: v.project.trim(), role: v.role || null, kind: v.kind,
    starts_at: v.kind === "self_tape" ? null : iso, due_at: v.kind === "self_tape" ? iso : null,
    location: v.location || null, casting: v.casting || null, material_raw: v.material_raw || null,
    bring: v.bring || null, notes: v.notes || null, tape_link: v.tape_link || null,
  };
}

/** A saved audition as form values, for the prep room's edit. A self-tape's date is its due date. */
export function valuesFromAudition(a: Audition): DraftValues {
  return {
    project: a.project, role: a.role ?? "", kind: a.kind,
    when: toLocalInput(a.kind === "self_tape" ? a.due_at ?? a.starts_at : a.starts_at ?? a.due_at),
    location: a.location ?? "", casting: a.casting ?? "", material_raw: a.material_raw ?? "",
    bring: a.bring ?? "", notes: a.notes ?? "", tape_link: a.tape_link ?? "",
  };
}

/**
 * Only what the actor changed, as a PATCH body. Both sides go through the same form round trip,
 * so a stored time with seconds doesn't read as a change. Status, reminders and tz are never in it.
 * A rewritten "asked for" drops the structured read of the old one, which no longer matches.
 */
export function patchFromValues(a: Audition, v: DraftValues): Record<string, unknown> {
  const before = bodyFromValues(valuesFromAudition(a));
  const after = bodyFromValues(v);
  const patch: Record<string, unknown> = {};
  for (const k of changedFields(before, after)) patch[k] = after[k];
  if ("material_raw" in patch && a.material) patch.material = null;
  return patch;
}
