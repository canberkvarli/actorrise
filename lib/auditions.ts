/**
 * The audition tracker, browser side. Shapes mirror backend/app/services/auditions/core.serialize.
 */

export type AuditionKind = "in_person" | "self_tape" | "virtual";
export type AuditionStatus = "submitted" | "scheduled" | "callback" | "booked" | "pinned" | "passed";
export type AuditionScope = "upcoming" | "waiting" | "past";

export type PrepStep = { key: "sides" | "upload" | "piece" | "bring"; label: string; done: boolean; href: string | null };

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
  pieces: AuditionPiece[];
  prep?: { runs: number; last_run_at: string | null; steps: PrepStep[] };
  bring_list: BringItem[];
  through: string | null;
  through_kind: ThroughKind | null;
  shoots: string | null;
  after_notes: AfterNotes;
  assist: Assist;
  /** The attached sides' first lines. Only on the list and one-audition reads. */
  sides?: { title: string | null; status: string | null; excerpt: string | null } | null;
};

export type ThroughKind = "agent" | "manager" | "self";
export type BringItem = { text: string; done: boolean; src: "email" | "ai" | "me" };
export type AfterNotes = Partial<Record<"how" | "differently" | "room", string>>;
export type Trip = {
  line: string; mode: "transit" | "drive"; minutes: number; leave_at: string; arrive_by: string;
  points: [number, number][]; from_label: string | null; to_label: string | null; maps_url: string;
};
export type Assist = {
  trip: Trip | null;
  read: { line: string | null; wear: string[] } | null;
  asks: { q: string; a: string; at: string }[];
};
export type Travel = { leaving_from: string | null; travel_mode: "transit" | "drive" };

/** A piece the actor is bringing. title/character/play_title name a monologue; null for a scene. */
export type AuditionPiece = {
  id: number; monologue_id: number | null; scene_id: number | null; used: boolean;
  title: string | null; character: string | null; play_title: string | null;
};

export type DraftField<T = string | null> = { value: T; confidence: "high" | "low" };
export type Draft = {
  project: DraftField; role: DraftField; kind: DraftField<AuditionKind>; starts_at: DraftField; due_at: DraftField;
  location: DraftField; casting: DraftField; material_raw: DraftField; bring: DraftField; notes: DraftField;
  through?: DraftField; through_kind?: DraftField<ThroughKind | null>; shoots?: DraftField;
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
export function safeTz(tz: string | undefined): string {
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

export type Moment = { key: "prep" | "eve" | "day" | "after"; label: string; day: string; at: number; passed: boolean };

/**
 * The four stops between now and the morning after, for the timeline under
 * the next-up ticket. Approximate on purpose (the server owns the real send
 * times): it only decides which stops are behind you.
 */
export function momentsFor(a: Pick<Audition, "when" | "tz" | "kind">, now: Date = new Date()): Moment[] {
  if (!a.when) return [];
  const t = new Date(a.when).getTime();
  const timeZone = safeTz(a.tz);
  const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "short", timeZone });
  const stops: [Moment["key"], string, number][] = [
    ["prep", "three days out", t - 72 * HOUR],
    ["eve", "the night before", t - 24 * HOUR],
    ["day", a.kind === "self_tape" ? "tape due" : "the day", t],
    ["after", "the morning after", t + 18 * HOUR],
  ];
  return stops.map(([key, label, at]) => ({ key, label, day: day(at), at, passed: at <= now.getTime() }));
}

/** Google Maps directions to the audition. No origin: the phone starts from where it is. */
export function directionsUrl(location: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location)}`;
}

/** "2:40 pm" in the audition's own zone. */
export function clockIn(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: safeTz(tz) }).replace(/\s?([AP])M$/, (_, m: string) => ` ${m.toLowerCase()}m`);
}

/** Calendar days from now to the audition, in its zone. Negative once it has passed. */
export function daysUntil(a: Pick<Audition, "when" | "tz">, now: Date = new Date()): number | null {
  if (!a.when) return null;
  const zone = safeTz(a.tz);
  return dayNumber(new Date(a.when), zone) - dayNumber(now, zone);
}

/** The line over the title: "Next up · in 5 days", "Tomorrow at 2:40", "Waiting to hear". */
export function eyebrow(a: Audition, now: Date = new Date(), next = false): string {
  if (a.status === "booked") return "Booked";
  if (a.status === "passed") return "Not this time";
  if (a.scope !== "upcoming") return a.status === "callback" ? "Callback" : "Waiting to hear";
  const d = daysUntil(a, now);
  const at = a.when ? clockIn(a.when, a.tz) : "";
  const due = a.kind === "self_tape";
  if (d === 0) return due ? `Tape due today at ${at}` : `Today at ${at}`;
  if (d === 1) return due ? `Tape due tomorrow at ${at}` : `Tomorrow at ${at}`;
  const lead = next ? "Next up" : a.status === "callback" ? "Callback" : "Coming up";
  return d == null ? lead : `${lead} · in ${d} days`;
}

/** "Tuesday at 2:40", or "Due Friday at 6:00" for a tape. */
export function whenSentence(a: Pick<Audition, "when" | "tz" | "kind">): string | null {
  if (!a.when) return null;
  const d = new Date(a.when);
  const zone = safeTz(a.tz);
  const day = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: zone });
  return `${a.kind === "self_tape" ? "Due " : ""}${day} at ${clockIn(a.when, a.tz)}`;
}

export type NextStep =
  | { kind: "link"; label: string; href: string; step: PrepStep["key"] }
  | { kind: "upload"; label: string }
  | { kind: "scroll"; label: string; target: "bring" | "after" };

/** The one orange button: the next thing to do for this audition, or null when there is nothing. */
export function nextStep(a: Audition, now: Date = new Date()): NextStep | null {
  const heard = a.status === "booked" || a.status === "passed";
  if (a.scope !== "upcoming") return heard || a.after_notes?.how ? null : { kind: "scroll", label: "How did it go?", target: "after" };
  const todo = a.prep?.steps.find((s) => !s.done && s.key !== "bring");
  if (todo?.key === "upload") return { kind: "upload", label: "Add their sides" };
  if (todo?.href) return { kind: "link", label: todo.key === "sides" ? "Run your sides" : "Pick your piece", href: todo.href, step: todo.key };
  const d = daysUntil(a, now);
  const packing = a.bring_list.some((i) => !i.done);
  if (d != null && d <= 1 && packing) return { kind: "scroll", label: "Pack", target: "bring" };
  const sides = a.prep?.steps.find((s) => s.key === "sides");
  if (sides?.href) return { kind: "link", label: "Run it again", href: sides.href, step: "sides" };
  if (packing) return { kind: "scroll", label: "Pack", target: "bring" };
  return null;
}

export type FileSection = "trip" | "sides" | "bring" | "after" | "ask";

/** The order the main column runs in: the order the actor lives it, with today's job on top. */
export function sectionOrder(a: Audition, now: Date = new Date()): FileSection[] {
  if (a.scope !== "upcoming") return ["after", "sides", "bring", "ask"];
  const d = daysUntil(a, now);
  const trip: FileSection[] = a.kind === "in_person" ? ["trip"] : [];
  if (d === 0) return [...trip, "bring", "sides", "after", "ask"];
  if (d === 1) return ["bring", ...trip, "sides", "after", "ask"];
  return [...trip, "sides", "bring", "after", "ask"];
}
