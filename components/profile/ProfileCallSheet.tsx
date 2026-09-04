"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The profile, read back as a casting line.
 *
 * This replaced a "Profile Completion 40%" card with a progress bar and a
 * checklist of ticks. That told an actor how much admin was left, which is a
 * reason to leave. A breakdown line tells them what they currently look like on
 * paper — and an unfinished one reads as unfinished, which is a reason to
 * finish it.
 *
 * Every gap is a button. The blank you are looking at is the field you want, so
 * tapping it should take you there rather than making you find it among three
 * tabs. The percentage stays, small and to one side: it is a footnote, not the
 * headline.
 */

export type CallSheetSlot = {
  key: string;
  /** The filled value, or null/empty when the actor hasn't answered yet. */
  value?: string | null;
  /** What to invite when empty. Lower case: it is an aside, not a heading. */
  blank: string;
  /** Which tab holds the field, and the id of the control to focus. */
  tab: string;
  fieldId: string;
};

type Props = {
  name?: string;
  /** Rendered as one line: identity. */
  primary: CallSheetSlot[];
  /** Rendered as a second, quieter line: how you work. */
  secondary: CallSheetSlot[];
  completion: number;
  saveStatus: "saving" | "saved" | null;
  onJump: (tab: string, fieldId: string) => void;
  /** 'educator' | 'student' | 'actor' | null. Null for most accounts. */
  accountType?: string | null;
  /** School, studio or company. Shown beside the mark when present. */
  organization?: string | null;
};

/** Stored value -> the word on the mark. Actors get nothing: on a page built
 *  for actors, "ACTOR" is a label on the room you are standing in. */
const CREDIT_MARK: Record<string, string> = {
  educator: "Teaching",
  student: "Studying",
};

function Blank({
  slot,
  onJump,
}: {
  slot: CallSheetSlot;
  onJump: Props["onJump"];
}) {
  return (
    // Grey at rest, orange on approach. Two orange blanks plus an orange rule,
    // an orange tab underline and an orange toggle put five competing accents on
    // one screen, and the eye landed on the gaps instead of the work.
    <button
      type="button"
      onClick={() => onJump(slot.tab, slot.fieldId)}
      className="border-b border-dashed border-muted-foreground/40 pb-0.5 lowercase text-muted-foreground/70 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {slot.blank}
    </button>
  );
}

function Line({
  slots,
  onJump,
  className,
}: {
  slots: CallSheetSlot[];
  onJump: Props["onJump"];
  className: string;
}) {
  const shown = slots.filter((s) => s.value?.trim() || s.blank);
  if (shown.length === 0) return null;

  return (
    <p className={className}>
      {shown.map((slot, i) => (
        <span key={slot.key}>
          {i > 0 && <span className="px-2 text-muted-foreground/40">·</span>}
          {slot.value?.trim() ? (
            <span>{slot.value}</span>
          ) : (
            <Blank slot={slot} onJump={onJump} />
          )}
        </span>
      ))}
    </p>
  );
}

export function ProfileCallSheet({
  name,
  primary,
  secondary,
  completion,
  saveStatus,
  onJump,
  accountType,
  organization,
}: Props) {
  const reduce = useReducedMotion();
  const pct = Math.round(completion);
  const mark = accountType ? CREDIT_MARK[accountType] : null;

  return (
    <div id="profile-progress" className="border-b border-border/70 pb-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {/* Not .stage-direction — that class force-lowercases, and this line
              carries the actor's own name. */}
          {/* "the line casting reads" is an actor's frame. A drama teacher is
              not waiting on a casting office, so she gets her own. */}
          <p className="mb-2 text-xs italic tracking-[0.08em] text-muted-foreground/70">
            {accountType === "educator" ? "(who you are, and where you teach.)" : "(the line casting reads.)"}
          </p>

          {/* The actor's name IS the page title. There was a separate "Your
              profile" h1 above this saying nothing the name doesn't. */}
          {name?.trim() ? (
            <h1 className="font-brand text-3xl font-medium leading-tight text-foreground sm:text-4xl">
              {name}
            </h1>
          ) : (
            <h1>
              <button
                type="button"
                onClick={() => onJump("basic", "name")}
                className="font-brand text-3xl font-medium leading-tight text-muted-foreground/60 underline decoration-dashed underline-offset-8 transition-colors hover:text-primary sm:text-4xl"
              >
                your name
              </button>
            </h1>
          )}

          {/* Sharp corners, because it is a mark and not a button. Sits under
              the name at the weight of a programme credit: present if you look,
              never competing with the name above it. */}
          {mark && (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                {mark}
              </span>
              {organization?.trim() && (
                <span className="text-sm text-muted-foreground">{organization}</span>
              )}
            </p>
          )}

          <Line
            slots={primary}
            onJump={onJump}
            className="font-typewriter mt-3 text-sm leading-relaxed text-foreground/85 sm:text-[15px]"
          />
          <Line
            slots={secondary}
            onJump={onJump}
            className="font-typewriter mt-1.5 text-sm leading-relaxed text-muted-foreground"
          />
        </div>

        <div className="shrink-0 text-right">
          <span className="font-typewriter text-2xl tabular-nums text-foreground/80">
            {pct}%
          </span>
          {/* The save state lives here rather than in a floating box bottom
              right. It belongs beside the thing that changed. */}
          <div className="h-4">
            <AnimatePresence mode="wait">
              {saveStatus && (
                <motion.p
                  key={saveStatus}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="stage-direction text-[11px] text-muted-foreground/70"
                >
                  {saveStatus === "saving" ? "(saving.)" : "(saved.)"}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* A hairline, not a chunky bar. It is a measure, not a milestone. */}
      <div className="relative mt-5 h-px w-full bg-border">
        <motion.div
          className="absolute inset-y-0 left-0 bg-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
