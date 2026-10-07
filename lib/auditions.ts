/**
 * The audition tracker, browser side. Shapes mirror backend/app/services/auditions/core.serialize.
 */

export type AuditionKind = "in_person" | "self_tape" | "virtual";
export type AuditionStatus = "submitted" | "scheduled" | "callback" | "booked" | "pinned" | "passed";
export type AuditionScope = "upcoming" | "waiting" | "past";

export type PrepStep = { key: "sides" | "piece" | "bring"; label: string; done: boolean; href: string | null };

export type Audition = {
  id: number;
  project: string;
  role: string | null;
  kind: AuditionKind;
  status: AuditionStatus;
  starts_at: string | null;
  due_at: string | null;
  when: string | null;
  tz: string;
  location: string | null;
  casting: string | null;
  material_raw: string | null;
  material: Record<string, unknown> | null;
  bring: string | null;
  notes: string | null;
  tape_link: string | null;
  source: "parse" | "manual" | "onboarding";
  user_script_id: number | null;
  reminders_on: boolean;
  scope: AuditionScope;
  created_at: string;
  pieces: { id: number; monologue_id: number | null; scene_id: number | null; used: boolean }[];
  prep?: { runs: number; last_run_at: string | null; steps: PrepStep[] };
};

export type DraftField<T = string | null> = { value: T; confidence: "high" | "low" };
export type Draft = {
  project: DraftField; role: DraftField; kind: DraftField<AuditionKind>; starts_at: DraftField; due_at: DraftField;
  location: DraftField; casting: DraftField; material_raw: DraftField; bring: DraftField; notes: DraftField;
  material: Record<string, unknown> | null;
};
export type AuditionQuota = { used: number; limit: number; remaining: number; tier: "free" | "plus" | "pro" };
export type ParseResult = { ok: boolean; draft: Draft; quota: AuditionQuota };

export const STATUS_ORDER: AuditionStatus[] = ["submitted", "scheduled", "callback", "booked", "pinned", "passed"];
export const STATUS_LABEL: Record<AuditionStatus, string> = {
  submitted: "Submitted", scheduled: "Audition", callback: "Callback", booked: "Booked", pinned: "Pinned", passed: "Passed",
};
export const KIND_LABEL: Record<AuditionKind, string> = { in_person: "In the room", self_tape: "Self-tape", virtual: "Virtual" };

const HOUR = 3_600_000;

/** An IANA zone the runtime accepts, else UTC. */
function safeTz(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** Calendar day number of an instant in a zone. */
function dayNumber(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / (24 * HOUR));
}

export function countdown(when: string | null, now: Date = new Date(), tz: string = "UTC"): { n: string; unit: string } {
  if (!when) return { n: "?", unit: "no date" };
  const zone = safeTz(tz);
  const t = new Date(when);
  const ms = t.getTime() - now.getTime();
  if (ms < 0) return { n: t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: zone }), unit: "" };
  if (ms < HOUR) return { n: "Now", unit: "" };
  if (ms < 12 * HOUR) {
    const h = Math.floor(ms / HOUR);
    return { n: String(h), unit: h === 1 ? "hour" : "hours" };
  }
  const diff = dayNumber(t, zone) - dayNumber(now, zone);
  if (diff <= 0) return { n: "Today", unit: "" };
  if (diff === 1) return { n: "Tomorrow", unit: "" };
  return { n: String(diff), unit: "days" };
}

/** "Thu Oct 9 · 10:40 AM" in the audition's own zone. */
export function whenLabel(a: Pick<Audition, "when" | "tz" | "kind">): string {
  if (!a.when) return "No date yet";
  const d = new Date(a.when);
  const timeZone = safeTz(a.tz);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return a.kind === "self_tape" ? `Due ${day}, ${time}` : `${day} · ${time}`;
}

export function groupByScope(list: Audition[]): Record<AuditionScope, Audition[]> {
  const out: Record<AuditionScope, Audition[]> = { upcoming: [], waiting: [], past: [] };
  for (const a of list) out[a.scope].push(a);
  return out;
}

/** ISO (UTC) -> value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function changedFields(parsed: Record<string, unknown>, saved: Record<string, unknown>): string[] {
  return Object.keys(saved).filter((k) => k in parsed && JSON.stringify(parsed[k] ?? null) !== JSON.stringify(saved[k] ?? null));
}
