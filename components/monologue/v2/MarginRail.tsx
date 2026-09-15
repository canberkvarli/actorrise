"use client";

import { IconPlayerPlay } from "@tabler/icons-react";

import { Monologue } from "@/types/actor";
import { overdoneBand } from "@/lib/poster";
import { formatClock } from "@/lib/estimateDuration";
import { usePieceHouse } from "@/hooks/useCallboardPulse";
import { clothFor } from "@/components/monologue/PlayCover";

/**
 * The margin.
 *
 * Everything here used to be somewhere else: the overdone readout was a badge
 * in the header, the marks were spread between a bar and a box at the foot of
 * the page, and the one thing the page is for — running it — was a pill
 * floating over the last paragraph. A margin is where a working actor keeps
 * what's true about the piece while they read it, so that's what this is.
 *
 * Sticky from lg up, a plain block below it. On a phone the rail's contents
 * fall under the piece and Rehearse moves to the run bar at the foot of the
 * screen — see RunBar.
 */

function Rule({ heavy }: { heavy?: boolean }) {
  return (
    <div
      aria-hidden
      className={heavy ? "border-t-[1.5px]" : "border-t"}
      style={{ borderColor: heavy ? "var(--t-text)" : "var(--t-line-light)" }}
    />
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="t-m__mono text-[11px] uppercase tracking-[0.16em]"
      style={{ color: "var(--t-muted-dark-2)" }}
    >
      {children}
    </p>
  );
}

/** How often a room hears this. Ten cells filled to the score. */
function OverdoneMeter({ score }: { score: number | null | undefined }) {
  const band = overdoneBand(score);
  // An unscored 0 means "the scorer hasn't reached this piece", not "nobody
  // performs it". Twelve thousand rows sit at 0, and printing "Rarely." over
  // them would be a confident claim on no evidence.
  if (!band) return null;

  const big = ["Rarely.", "Now and then.", "Often.", "Constantly."][band.level];
  const note = [
    "Auditors don't see this one much. You'll have the room to yourself.",
    "Seen now and then. A strong choice still lands.",
    "Auditors know this one. Walk in knowing that.",
    "Everyone brings this. Walk in knowing that, or pick the one below it.",
  ][band.level];
  const colour = [
    "var(--t-text)",
    "var(--t-text)",
    "var(--t-orange-deep)",
    "var(--t-orange-deep)",
  ][band.level];

  const filled = Math.max(1, Math.round((score ?? 0) * 10));

  return (
    <div className="pt-[18px]">
      <Rule heavy />
      <div className="pt-[18px]">
        <SectionLabel>how often a room hears this</SectionLabel>
        <p
          className="t-m__display mt-1.5 text-[30px] leading-[1.05]"
          style={{ color: colour }}
        >
          {big}
        </p>
        <div aria-hidden className="mt-2.5 flex gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-[2px]"
              style={{
                background: i < filled ? colour : "var(--t-line-light-2)",
              }}
            />
          ))}
        </div>
        <p
          className="mt-2 text-[13px] leading-[1.5]"
          style={{ color: "var(--t-muted-dark)" }}
        >
          {note}
        </p>
      </div>
    </div>
  );
}

function MarkRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <p className="m-0 flex justify-between gap-2">
      <span style={{ color: "var(--t-muted-dark)" }}>{label}</span>
      <strong style={tone ? { color: tone } : undefined}>{value}</strong>
    </p>
  );
}

/** "3h", "yesterday", "3d" — the whisper's own scale. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d`;
}

export function MarginRail({
  monologue,
  beatCount,
  memorized,
  cutSeconds,
  fullSeconds,
  hasCut,
  onRehearse,
  outOfReads,
}: {
  monologue: Monologue;
  beatCount: number;
  memorized: boolean;
  cutSeconds: number;
  fullSeconds: number;
  hasCut: boolean;
  onRehearse: () => void;
  /** The reads are spent. Said plainly; never as a count we can't see. */
  outOfReads?: boolean;
}) {
  const house = usePieceHouse(monologue.id);

  return (
    <aside className="t-m-rise flex flex-col gap-[18px]">
      {/* Rehearse. Desktop only — on a phone this is the run bar at the foot
          of the screen, and two of it would be one too many. */}
      {!outOfReads && (
        <div className="hidden lg:block">
          <button
            type="button"
            onClick={onRehearse}
            className="inline-flex h-[60px] w-full items-center justify-between gap-3 rounded-full pl-6 pr-2 text-[17px] font-bold transition-transform duration-300 hover:scale-[1.03] hover:-rotate-1"
            style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
          >
            Rehearse this
            <span
              className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full"
              style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
            >
              <IconPlayerPlay className="h-4 w-4 fill-current" />
            </span>
          </button>
          <p
            className="t-m__dir mt-2.5 text-center text-[12px]"
            style={{ color: "var(--t-faint)" }}
          >
            (you read {monologue.character_name.toLowerCase()}. scenepartner reads the room.)
          </p>
        </div>
      )}

      <OverdoneMeter score={monologue.overdone_score} />

      {/* Your marks */}
      <div className="pt-[18px]">
        <Rule />
        <div className="pt-[18px]">
          <SectionLabel>your marks</SectionLabel>
          <div className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <MarkRow label="beats noted" value={String(beatCount)} />
            <MarkRow
              label="cut"
              value={
                hasCut
                  ? `${formatClock(cutSeconds)} of ${formatClock(fullSeconds)}`
                  : "full piece"
              }
            />
            <MarkRow
              label="off book"
              value={memorized ? "yes" : "not yet"}
              tone={memorized ? "var(--t-orange-deep)" : undefined}
            />
          </div>
          {outOfReads && (
            <p
              className="t-m__dir mt-3 text-[12px]"
              style={{ color: "var(--t-faint)" }}
            >
              (no free reads left this month. plus is unlimited.)
            </p>
          )}
        </div>
      </div>

      {/* In the house. Real events only — no count. The pulse sees a window of
          recent activity, so any total printed here would silently undercount
          and drift, which is why usePieceHouse returns a roll and not a number. */}
      {house.length > 0 && (
        <div className="pt-[18px]">
          <Rule />
          <div className="pt-[18px]">
            <p
              className="t-m__mono m-0 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--t-muted-dark-2)" }}
            >
              <span
                aria-hidden
                className="t-m-breathe h-[7px] w-[7px] rounded-full"
                style={{ background: "var(--t-orange-deep)" }}
              />
              in the house with this
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {house.map((e) => {
                const did =
                  e.event_type === "bookmarked"
                    ? "saved"
                    : e.event_type === "shared"
                      ? "shared"
                      : "read";
                const name = e.name || "Someone";
                return (
                  <div key={e.id} className="flex items-center gap-2.5 text-[13px]">
                    <span
                      role="img"
                      aria-label={name}
                      className="t-m__display flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] italic"
                      style={{
                        borderColor: "var(--t-text)",
                        background: clothFor(name).bg,
                        color: "var(--t-cream)",
                        fontSize: 14,
                      }}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate">
                      <strong>{name}</strong>
                      <span style={{ color: "var(--t-muted-dark-2)" }}>
                        {e.city ? ` · ${e.city}` : ""} · {did}
                      </span>
                    </span>
                    <span
                      className="t-m__mono ml-auto flex-shrink-0 text-[11px]"
                      style={{ color: "var(--t-faint)" }}
                    >
                      {ago(e.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
