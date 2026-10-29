"use client";

export type ClassStudent = {
  name: string;
  joined_at: string;
  plus_until: string | null;
  on_plus: boolean;
  searches: number;
  monologues_practised: number;
  monologues_finished: number;
  scenes_run: number;
  last_active: string | null;
};

const DAY = 86_400_000;

function ago(iso: string | null, now: number): string {
  if (!iso) return "not yet";
  const days = Math.floor((now - new Date(iso).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The list of a teacher's students (app/(platform)/class): who joined, when
 * they were last active, and counts of what they did. Counts only; what a
 * student searched for stays theirs (services/class_links.class_roster).
 * `now` is when the list loaded, so "3 days ago" does not shift on re-render.
 */
export function ClassRoster({ students, now }: { students: ClassStudent[]; now: number }) {
  const sorted = [...students].sort(
    (a, b) => new Date(b.last_active ?? 0).getTime() - new Date(a.last_active ?? 0).getTime(),
  );
  const activeWeek = sorted.filter((s) => s.last_active && now - new Date(s.last_active).getTime() < 7 * DAY).length;
  const finished = sorted.filter((s) => s.monologues_finished > 0).length;
  const muted = { color: "var(--t-muted-dark)" } as const;

  return (
    <>
          <p className="mt-2 text-[15px] leading-normal" style={muted}>
            {sorted.length} {sorted.length === 1 ? "student" : "students"} in, {activeWeek} active this week,{" "}
            {finished} {finished === 1 ? "has" : "have"} run a monologue all the way through. You see what they did,
            never what they searched for.
          </p>

          <div className="mt-6 border-t" style={{ borderColor: "var(--t-line-light-2)" }}>
            <div
              className="hidden grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] gap-3 border-b py-2 text-[13px] font-semibold md:grid"
              style={{ borderColor: "var(--t-line-light-2)", ...muted }}
            >
              <span>Student</span>
              <span>Last active</span>
              <span>Searches</span>
              <span>Monologues</span>
              <span>Scenes run</span>
              <span>Plus until</span>
            </div>
            <ul>
              {sorted.map((s, i) => (
                <li
                  key={`${s.name}-${i}`}
                  className="grid grid-cols-2 gap-x-3 gap-y-1 border-b py-3 text-[15px] md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))] md:items-center"
                  style={{ borderColor: "var(--t-line-light-2)" }}
                >
                  <span className="col-span-2 min-w-0 truncate font-semibold md:col-span-1">
                    {s.name}
                    <span className="ml-2 font-normal md:hidden" style={muted}>
                      joined {shortDate(s.joined_at)}
                    </span>
                  </span>
                  <span>
                    <span className="md:hidden" style={muted}>Last active </span>
                    {ago(s.last_active, now)}
                  </span>
                  <span>
                    <span className="md:hidden" style={muted}>Searches </span>
                    {s.searches}
                  </span>
                  <span>
                    <span className="md:hidden" style={muted}>Monologues </span>
                    {s.monologues_practised === 0 ? "none yet" : `${s.monologues_finished} of ${s.monologues_practised} finished`}
                  </span>
                  <span>
                    <span className="md:hidden" style={muted}>Scenes </span>
                    {s.scenes_run}
                  </span>
                  <span style={s.on_plus ? undefined : muted}>
                    <span className="md:hidden" style={muted}>Plus </span>
                    {s.on_plus ? (s.plus_until ? shortDate(s.plus_until) : "on") : "ended"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
  );
}
