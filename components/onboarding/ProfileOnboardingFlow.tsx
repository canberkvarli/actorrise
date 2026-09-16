"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { theatreFontVars } from "@/lib/fonts/theatre";
import { markOnboardingDone } from "@/components/onboarding/useTourTrigger";
import { Glyph } from "@/components/brand/glyphs";
import LampSketch from "@/components/onboarding/LampSketch";
import { clothFor, emblemFor } from "@/components/monologue/PlayCover";
import type { Monologue } from "@/types/actor";
import {
  AGE_RANGES,
  CASTING,
  WORK_ON,
  MEDIUMS,
  CAREER_STAGES,
  REFERRAL_SOURCES,
} from "@/lib/profileOptions";
import {
  buildProfileWrite,
  buildPayoffParams,
  describeAnswers,
  type OnboardingAnswers,
} from "@/lib/onboardingFilters";

const stepTransition = {
  type: "tween" as const,
  duration: 0.32,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

const SPRING = [0.34, 1.56, 0.64, 1] as [number, number, number, number];
const ENTER = [0.22, 1, 0.36, 1] as [number, number, number, number];

type Variant = "new" | "backfill";

// Referral goes first, and only for new signups. Every other answer can be
// recovered later (the backfill card exists for exactly that), but how someone
// found me decays from memory within days — it is the one question I could not
// answer about the August signups at all.
//
// Asked of new accounts only: putting "How did you find me?" in front of
// someone who has been using the app for months reads like the app forgot
// them, and their recall that far out is not worth much anyway.
const REFERRAL_QUESTION = {
  key: "referral",
  prompt: "How did you find me?",
  hint: "One tap. It's the only way I know what's working.",
} as const;

// Also new-signups-only, and also written on tap rather than at the end. Every
// account used to be assumed a working actor; the educator funnel needs the
// three apart, and a teacher who abandons the wizard is exactly the person I
// most need counted. Fully optional — Continue is enabled with nothing picked.
const ACCOUNT_TYPE_QUESTION = {
  key: "accountType",
  prompt: "Actor, teacher, or student?",
  hint: null,
} as const;

// Label is what the person calls themselves; id is the stored account_type.
const ACCOUNT_TYPES = [
  { id: "actor", label: "Actor" },
  { id: "educator", label: "Teacher" },
  { id: "student", label: "Student" },
] as const;

const PROFILE_QUESTIONS = [
  { key: "casting", prompt: "How are you usually cast?", hint: "So the roles I show you are ones you could actually book." },
  { key: "ageRange", prompt: "What's your playing age?", hint: null },
  { key: "workOn", prompt: "What do you want to work on?", hint: "Pick as many as you like." },
  { key: "mediums", prompt: "Where do you want to work?", hint: "Theatre, film, TV. Pick any." },
  { key: "stage", prompt: "Where are you in it?", hint: null },
] as const;

type QuestionKey =
  | typeof REFERRAL_QUESTION.key
  | typeof ACCOUNT_TYPE_QUESTION.key
  | typeof PROFILE_QUESTIONS[number]["key"];

// Two-column tiles for the short-label questions; the rest read better stacked.
/* `workOn` joined these when it went from four tiles to eight: in one column
   that is an eight-row stack taller than the card, and the Continue pill ends
   up below the fold on a laptop. */
const TWO_COLUMN_KEYS = new Set<QuestionKey>(["referral", "ageRange", "mediums", "workOn"]);

/* The stage direction over each question, and the act it belongs to.
 *
 * Both are keyed off the question, never off its index: the backfill variant
 * drops `referral`, so an index-keyed table would hand the backfill's first
 * screen the "(before anything.)" of a question it never asks and shift every
 * act numeral up by one. The two bookkeeping questions sit outside the acts —
 * the play starts when the questions start being about them. */
const DIRECTION: Record<QuestionKey, string> = {
  referral: "(before anything.)",
  accountType: "(and who's asking.)",
  casting: "(act i. the type.)",
  ageRange: "(act ii. the age.)",
  workOn: "(act iii. the work.)",
  mediums: "(act iv. the room.)",
  stage: "(act v. where you are.)",
};

const NUMERAL: Partial<Record<QuestionKey, string>> = {
  casting: "I",
  ageRange: "II",
  workOn: "III",
  mediums: "IV",
  stage: "V",
};

// Read while the profile is written and the first search runs. They advance on
// a timer and hold on the last one, so a slow search never runs out of script.
const BEATS = [
  "(reading your answers.)",
  "(pulling the pieces that fit.)",
  "(putting the overdone ones back.)",
  "(almost.)",
];

const COUNT_WORD = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

function Tile({
  selected,
  onClick,
  label,
  sublabel,
  index,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
  index: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ENTER, delay: index * 0.04 }}
      whileHover={{ y: -2, rotate: -0.6 }}
      className="flex min-h-[52px] w-full touch-manipulation items-center justify-between gap-2.5 rounded-[14px] border-[1.5px] py-2.5 pl-4 pr-3 text-left transition-colors"
      style={{
        borderColor: selected ? "var(--t-text)" : "var(--t-line-light)",
        background: selected ? "var(--t-gel)" : "var(--t-paper)",
        // Never --t-text here: it is cream in dark mode, and cream on the gel
        // is the one unreadable pair on this card.
        color: selected ? "var(--t-on-gel)" : "var(--t-text)",
      }}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold tracking-[-0.01em]">{label}</span>
        {sublabel ? (
          <span
            className="mt-px block text-[11px]"
            style={{
              fontFamily: "var(--t-direction)",
              color: selected ? "var(--t-on-gel)" : "var(--t-muted-dark-2)",
            }}
          >
            {sublabel}
          </span>
        ) : null}
      </span>
      <span
        className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
        style={{
          borderColor: selected ? "var(--t-text)" : "var(--t-line-light)",
          background: selected ? "var(--t-cream)" : "transparent",
          color: "var(--t-on-gel)",
        }}
      >
        {selected && (
          <motion.svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.3, ease: SPRING }}
          >
            <path d="m5 12 5 5L20 7" />
          </motion.svg>
        )}
      </span>
    </motion.button>
  );
}

/** The card's primary pill: label left, gel arrow dot right. */
/** Add or drop an id in a multi-select list. Shared by the question tiles
 *  (string ids) and the payoff's keep list (monologue ids). */
function toggle<T>(arr: T[], id: T): T[] {
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function CtaPill({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02, rotate: -0.8 }}
      transition={{ duration: 0.3, ease: SPRING }}
      className="flex h-[52px] flex-1 items-center justify-between gap-3 rounded-full pl-[22px] pr-1.5 text-base font-bold transition-opacity"
      style={{
        background: "var(--t-cta-bg)",
        color: "var(--t-cta-fg)",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
      <span
        className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--t-cta-dot-bg)", color: "var(--t-cta-dot-fg)" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </motion.button>
  );
}

export default function ProfileOnboardingFlow({
  variant,
  onClose,
}: {
  variant: Variant;
  onClose: () => void;
}) {
  const { refreshUser } = useAuth();
  const router = useRouter();
  const reduce = useReducedMotion();

  const questions = useMemo(
    // Backfill gets the account-type question too, unlike referral. How you
    // found me decays from memory; whether you teach does not, and the 800
    // accounts that predate this question are exactly where the educators are
    // hiding.
    () =>
      variant === "new"
        ? [REFERRAL_QUESTION, ACCOUNT_TYPE_QUESTION, ...PROFILE_QUESTIONS]
        : [ACCOUNT_TYPE_QUESTION, ...PROFILE_QUESTIONS],
    [variant]
  );
  const totalSteps = questions.length;

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  // "settling" is the beat between the last tap and the picks: the profile is
  // being written and the first search has not come back. It used to be a
  // disabled button with a spinner label; it is now the only moment in the
  // product that says out loud what it is doing with the answers.
  const [phase, setPhase] = useState<"q" | "settling" | "payoff">("q");
  const [picks, setPicks] = useState<Monologue[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Where in the wizard people stop. The last step_viewed without an
  // onboarding_completed is the drop-off point; nothing recorded it before.
  useEffect(() => {
    if (phase !== "q") return;
    const key = questions[step]?.key;
    if (!key) return;
    trackEvent("onboarding_step_viewed", { step, key, total: totalSteps, variant });
  }, [step, questions, totalSteps, variant, phase]);

  const [referral, setReferral] = useState<string | null>(null);
  const [referralDetail, setReferralDetail] = useState("");
  const [accountType, setAccountType] = useState<string | null>(null);
  const [organization, setOrganization] = useState("");
  const [casting, setCasting] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [workOn, setWorkOn] = useState<string[]>([]);
  const [mediums, setMediums] = useState<string[]>([]);
  const [stage, setStage] = useState<string | null>(null);

  // Written the moment it's tapped rather than with the rest at the end: most
  // of the value is in the answers from people who then abandon the wizard,
  // and those never reach persist(). Fire-and-forget — a failed attribution
  // write must never block onboarding.
  const chooseReferral = useCallback((id: string) => {
    setReferral(id);
    void api.patch("/api/auth/onboarding", { referral_source: id }).catch(() => {});
    // Switching away from "Somewhere else" clears any detail already typed, so an
    // Instagram signup never carries a stray "state theatre" note.
    if (id !== "other") {
      setReferralDetail((prev) => {
        if (prev) void api.patch("/api/auth/onboarding", { referral_detail: "" }).catch(() => {});
        return "";
      });
    }
  }, []);

  // Optional free-text for "Somewhere else". A second fire-and-forget write (on
  // blur / Continue), never a blocker: an empty box is valid and must still let
  // the required step pass. Empty string clears the column to null server-side.
  const saveReferralDetail = useCallback(() => {
    void api.patch("/api/auth/onboarding", { referral_detail: referralDetail.trim() }).catch(() => {});
  }, [referralDetail]);

  // Same fire-and-forget shape as referral, for the same reason.
  const chooseAccountType = useCallback((id: string) => {
    setAccountType(id);
    void api.patch("/api/auth/onboarding", { account_type: id }).catch(() => {});
    // Only teachers and students are asked where from; switching back to Actor
    // clears anything already typed so no stray school name is left behind.
    if (id === "actor") {
      setOrganization((prev) => {
        if (prev) void api.patch("/api/auth/onboarding", { organization: "" }).catch(() => {});
        return "";
      });
    }
  }, []);

  const saveOrganization = useCallback(() => {
    void api.patch("/api/auth/onboarding", { organization: organization.trim() }).catch(() => {});
  }, [organization]);

  const answers: OnboardingAnswers = useMemo(
    () => ({ casting, ageRange, workOn, mediums, stage }),
    [casting, ageRange, workOn, mediums, stage]
  );

  // Keyed off the question, not its index: the index shifts with `variant`,
  // and shifting positions by hand is how the wrong question ends up gating
  // the wrong answer.
  const stepValid = useMemo(() => {
    switch (questions[step]?.key) {
      // Optional: Continue stays live with nothing picked, so nobody is stopped
      // at signup by a question that only exists for my own bookkeeping. That
      // was written about accountType and is truer of referral, which is
      // bookkeeping and nothing else — and which users.referrer has captured
      // by itself since 2026-09-06. Leaving Continue dead here made the first
      // screen a stranger ever sees a wall they had to answer to get past.
      case "referral": return true;
      case "accountType": return true;
      case "casting": return !!casting;
      case "ageRange": return !!ageRange;
      case "workOn": return workOn.length > 0;
      case "mediums": return mediums.length > 0;
      case "stage": return !!stage;
      default: return false;
    }
    // `referral` is deliberately not a dependency: it no longer gates Continue.
  }, [questions, step, casting, ageRange, workOn, mediums, stage]);

  const goTo = useCallback((delta: number) => {
    setDirection(delta > 0 ? 1 : -1);
    setStep((s) => Math.min(totalSteps - 1, Math.max(0, s + delta)));
  }, [totalSteps]);

  const persist = useCallback(async () => {
    // Write the real search levers, then flip the flags. Do the profile write
    // first so the payoff search also benefits from profile bias. We deliberately
    // do NOT refreshUser() here — keeping the client flag false keeps the gate
    // open through the payoff. refreshUser() runs on exit (endFlow).
    await api.put("/api/profile", buildProfileWrite(answers));
    await api.patch("/api/auth/onboarding", {
      has_completed_onboarding: true,
      has_completed_profile_onboarding: true,
      has_seen_welcome: true,
    });
  }, [answers]);

  // Close the flow immediately, then sync the client user in the background so
  // the rest of the app sees the new flags/profile.
  const endFlow = useCallback(() => {
    // Latch BEFORE the refresh, and on every exit including skip. The refresh
    // is deliberately not awaited so closing stays instant, which means the
    // in-memory user can still read has_completed_onboarding === false when the
    // next surface's tour asks. This is what the tours actually gate on now.
    markOnboardingDone();
    onClose();
    void refreshUser();
  }, [onClose, refreshUser]);

  const handleFinishQuestions = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setDirection(1);
    setPhase("settling");
    try {
      await persist();
    } catch {
      // Back to the last question rather than trapping them on a lamp that
      // never resolves; the answers are all still in state.
      setPhase("q");
      setSubmitting(false);
      return;
    }
    // The search is run HERE, not inside the payoff, so the whole wait is one
    // mount of one lamp. Fetching it in the payoff meant the card drew the
    // lamp for the profile write, unmounted, and drew it again from the first
    // frame for the search — the same three seconds, played twice.
    setPicks(await fetchPicks(answers));
    setPhase("payoff");
  }, [submitting, persist, answers]);

  const handleSkip = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (variant === "new") {
        // Close the first-run gate but leave the profile flag unset so the soft
        // backfill card can re-invite them later. No profile write.
        await api.patch("/api/auth/onboarding", {
          has_completed_onboarding: true,
          has_seen_welcome: true,
        });
      }
      endFlow();
    } catch {
      setSubmitting(false);
    }
  }, [submitting, variant, endFlow]);

  /**
   * Take the picks into the collection and leave them ON the platform.
   *
   * This used to drop straight into /monologue/<id>/work, which got somebody
   * rehearsing a piece thirty seconds after signing up, before they had seen
   * the library the piece came from. It also meant the payoff could only ever
   * bank ONE of the picks; the other two were thrown away by the act of
   * choosing. Saving is the cheaper commitment and the reversible one, so the
   * payoff banks as many as they want and hands them the library to look
   * around in, with a collection that already has something in it.
   *
   * Failures are swallowed on purpose: a first run must not end on an error
   * toast about a bookmark. Anything that did not save is still in the library.
   */
  const keepPicks = useCallback(
    (ids: number[]) => {
      // Fired, not awaited. Six POSTs took long enough that the card sat on
      // "Putting them away…" with a dead pill while the actor watched, which
      // turned the last beat of the flow into a loading screen. The requests
      // are not cancelled by unmounting, so they land either way, and the
      // collection is somewhere the actor goes next rather than right now.
      ids.forEach((id) => {
        void api.post(`/api/monologues/${id}/favorite`).catch(() => {});
      });
      // No navigation. The card closes onto whatever page the actor was already
      // on, and that page's tour picks them up. Pushing a route here is what
      // made ScenePartner flash past for a beat on the way to /work, and it
      // also decided for them where to go next on their first minute.
      endFlow();
    },
    [endFlow]
  );

  // Every step is skippable, including this one.
  //
  // The referral tap was made required on 2026-08-19 (125612bd) on the
  // reasoning that an attribution answer cannot be reconstructed later the way
  // the profile ones can. That reasoning has since expired twice over, and the
  // cost of it is visible by weekly signup cohort:
  //
  //   week of      finished onboarding      finished the profile
  //   2026-08-03           98%                      67%
  //   2026-08-10           97%                      72%
  //   2026-08-17           90%                      60%   <- made required
  //   2026-08-24           83%                      48%
  //   2026-08-31           74%                      53%
  //
  // Search and rehearsal rates held flat across those same weeks, so this is
  // not traffic quality; it is the wall. The answer is now reconstructable:
  // users.referrer and utm_* have captured first touch automatically since
  // 2026-09-06, and 8 of the first 9 signups after that deploy carried a real
  // referrer. So the one question a stranger must answer before seeing
  // anything was buying data we already collect.
  const referralRequired = false;

  const isQuestion = phase === "q";
  const current = questions[step];
  const numeral = isQuestion ? NUMERAL[current.key] : phase === "payoff" ? "✦" : undefined;

  return (
    <div
      /* z above the app bar (9998) AND above FirstRunCurtain (9999), which
         holds the stage until this chunk loads. At z-[100] the header floated
         over a full-screen takeover: the actor was being asked "how did you
         find me?" under a nav offering Monologues, ScenePartner and Collection,
         which is three exits from a card that has not introduced itself yet. */
      className={`theatre-tokens theatre-onboarding ${theatreFontVars} fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto overflow-x-clip p-6 sm:items-center`}
      style={{ background: "var(--page)" }}
    >
      {/* The fixture, hanging in the flies. The same drawing the wait uses, so
          the lamp the actor meets here is the lamp that draws itself in a
          moment later — one fixture, held, rather than a new one per screen.
          Hung already lit; only the wait animates.

          Painted at z-0 with the card at z-10 — a negative z-index here would
          slide under the overlay's own background and never once be seen. */}
      {/* The fixture used to hang here, over the card. It is gone from this
          screen: on a laptop it pushed the card down far enough that the
          Continue pill met the bottom of the window, and it duplicated the lamp
          that draws itself during the wait a few seconds later — so the same
          fixture appeared twice in one flow, once static and once animated.
          The wait still has it, where it is doing something. */}
      <p
        aria-hidden
        className="pointer-events-none fixed bottom-5 left-6 z-0 m-0 hidden text-xs italic tracking-[0.08em] sm:block"
        style={{ fontFamily: "var(--t-direction)", color: "oklch(0.45 0.03 55)" }}
      >
        (first night. the house is dark. one light on.)
      </p>

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={variant === "new" ? "Set up your profile" : "Finish your profile"}
        initial={reduce ? false : { opacity: 0, y: 28, scale: 0.97, rotate: -0.5 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: -0.6 }}
        transition={{ duration: 0.6, ease: ENTER }}
        className="relative z-10 my-auto w-full overflow-hidden rounded-lg border-[1.5px] transition-[max-width] duration-500"
        style={{
          maxWidth: phase === "payoff" ? 560 : 480,
          background: "var(--card)",
          color: "var(--t-text)",
          borderColor: "var(--t-text)",
          boxShadow: "14px 14px 0 var(--t-gel), 0 40px 120px -30px rgb(0 0 0 / 0.8)",
        }}
      >
        {numeral && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-[18px] select-none italic leading-none"
            style={{
              fontFamily: "var(--t-display)",
              fontSize: 170,
              color: "color-mix(in oklab, var(--t-text) 5%, transparent)",
            }}
          >
            {numeral}
          </span>
        )}

        {/* Top strip: the act dots, and the way out. */}
        <div className="relative flex items-center justify-between gap-3 px-5 pt-4">
          <div className="flex items-center gap-[5px]" aria-hidden>
            {questions.map((q, i) => (
              <span
                key={q.key}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === step && isQuestion ? 24 : 8,
                  background:
                    i < step || !isQuestion
                      ? "var(--acc)"
                      : i === step
                        ? "var(--t-text)"
                        : "color-mix(in oklab, var(--t-text) 20%, transparent)",
                }}
              />
            ))}
          </div>
          {isQuestion && !referralRequired && (
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="cursor-pointer border-0 bg-transparent py-1.5 text-xs italic tracking-[0.06em] underline underline-offset-4 transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--t-faint)")}
            >
              {variant === "backfill" ? "not now" : "skip"}
            </button>
          )}
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          {isQuestion ? (
            <motion.div
              key={`q-${step}`}
              custom={direction}
              initial={{ opacity: 0, x: direction * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -28 }}
              transition={stepTransition}
              className="relative px-7 pb-7 pt-[22px]"
            >
              <p
                className="m-0 text-[13px] italic tracking-[0.08em]"
                style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
              >
                {DIRECTION[current.key]}
              </p>
              <h2
                className="mt-2 text-balance font-normal leading-none tracking-[-0.02em]"
                style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)" }}
              >
                {current.prompt}
              </h2>
              {current.hint ? (
                <p className="mt-2.5 text-sm leading-normal" style={{ color: "var(--t-muted-dark)" }}>
                  {current.hint}
                </p>
              ) : null}

              <div
                className={`mt-[22px] grid gap-2 ${TWO_COLUMN_KEYS.has(current.key) ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {current.key === "referral" &&
                  REFERRAL_SOURCES.map((r, i) => (
                    <Tile key={r.id} index={i} label={r.label} selected={referral === r.id} onClick={() => chooseReferral(r.id)} />
                  ))}
                {current.key === "accountType" &&
                  ACCOUNT_TYPES.map((a, i) => (
                    <Tile key={a.id} index={i} label={a.label} selected={accountType === a.id} onClick={() => chooseAccountType(a.id)} />
                  ))}
                {current.key === "casting" &&
                  CASTING.map((c, i) => (
                    <Tile key={c.id} index={i} label={c.label} selected={casting === c.id} onClick={() => setCasting(c.id)} />
                  ))}
                {current.key === "ageRange" &&
                  AGE_RANGES.map((a, i) => (
                    <Tile key={a} index={i} label={a.replace("-", "–")} selected={ageRange === a} onClick={() => setAgeRange(a)} />
                  ))}
                {current.key === "workOn" &&
                  WORK_ON.map((w, i) => (
                    <Tile key={w.id} index={i} label={w.label} selected={workOn.includes(w.id)} onClick={() => setWorkOn((cur) => toggle(cur, w.id))} />
                  ))}
                {current.key === "mediums" &&
                  MEDIUMS.map((m, i) => (
                    <Tile key={m.id} index={i} label={m.label} selected={mediums.includes(m.id)} onClick={() => setMediums((cur) => toggle(cur, m.id))} />
                  ))}
                {current.key === "stage" &&
                  CAREER_STAGES.map((s, i) => (
                    <Tile key={s.id} index={i} label={s.label} sublabel={s.sublabel} selected={stage === s.id} onClick={() => setStage(s.id)} />
                  ))}
              </div>

              {current.key === "referral" && referral === "other" && (
                <motion.input
                  type="text"
                  value={referralDetail}
                  onChange={(e) => setReferralDetail(e.target.value)}
                  onBlur={saveReferralDetail}
                  maxLength={280}
                  autoFocus
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  placeholder="Where'd you hear about me? (optional)"
                  className="mt-2 h-12 w-full rounded-[14px] border-[1.5px] px-4 text-sm outline-none transition-colors"
                  style={{ borderColor: "var(--t-line-light)", background: "var(--t-paper)", color: "var(--t-text)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--t-text)")}
                />
              )}

              {/* The offer, at the only moment someone volunteers that they
                  teach. A rule in the brand orange rather than a boxed
                  callout: this is an aside in their own flow, not an ad
                  interrupting it. */}
              {current.key === "accountType" && (accountType === "educator" || accountType === "student") && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-3 border-l-2 py-3 pl-4 pr-3.5"
                  style={{
                    borderColor: "var(--acc)",
                    background: "color-mix(in oklab, var(--acc) 7%, transparent)",
                  }}
                >
                  <p className="m-0 text-sm leading-normal" style={{ color: "var(--t-text)" }}>
                    {/* "Plus" meant nothing to anyone here: this is the third
                        screen of a first run, and the plan names live on a
                        pricing page they have not seen. Say what it opens, then
                        name it. */}
                    {accountType === "educator" ? (
                      <>
                        Then it&apos;s on me. The whole library, unlimited searches
                        and the AI scene partner, free for you and for your
                        students. That&apos;s the paid plan, Plus. Email me at{" "}
                        <strong className="font-semibold" style={{ color: "var(--acc)" }}>canberk@actorrise.com</strong>{" "}
                        with their addresses and I&apos;ll set the whole class up at once.
                      </>
                    ) : (
                      <>
                        Students don&apos;t pay. The whole library, unlimited
                        searches and the AI scene partner, which is the paid plan,
                        Plus. Get your teacher to email me at{" "}
                        <strong className="font-semibold" style={{ color: "var(--acc)" }}>canberk@actorrise.com</strong>{" "}
                        and I&apos;ll do your whole class together.
                      </>
                    )}
                  </p>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    onBlur={saveOrganization}
                    maxLength={280}
                    autoFocus
                    placeholder={accountType === "educator" ? "School or studio (optional)" : "Your school (optional)"}
                    className="mt-2.5 h-11 w-full rounded-xl border-[1.5px] px-3.5 text-sm outline-none transition-colors"
                    style={{ borderColor: "var(--t-line-light)", background: "var(--t-paper)", color: "var(--t-text)" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--t-text)")}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "var(--t-line-light)")}
                  />
                </motion.div>
              )}

              <div className="mt-6 flex items-center gap-2.5">
                {step > 0 && (
                  <motion.button
                    type="button"
                    onClick={() => goTo(-1)}
                    disabled={submitting}
                    aria-label="Back"
                    whileHover={{ x: -3 }}
                    transition={{ duration: 0.3, ease: SPRING }}
                    className="flex size-12 shrink-0 items-center justify-center rounded-full border-[1.5px] bg-transparent"
                    style={{ borderColor: "var(--t-text)", color: "var(--t-text)" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M19 12H5M11 18l-6-6 6-6" />
                    </svg>
                  </motion.button>
                )}
                {step < totalSteps - 1 ? (
                  <CtaPill onClick={() => goTo(1)} disabled={!stepValid}>Continue</CtaPill>
                ) : (
                  <CtaPill onClick={handleFinishQuestions} disabled={!stepValid || submitting}>
                    Show me my monologues
                  </CtaPill>
                )}
              </div>
            </motion.div>
          ) : phase === "settling" ? (
            <motion.div key="settling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={stepTransition}>
              <SettingTheStage />
            </motion.div>
          ) : (
            <motion.div
              key="payoff"
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -28 }}
              transition={stepTransition}
            >
              <OnboardingPayoff
                answers={answers}
                items={picks}
                onKeep={keepPicks}
                onClose={endFlow}
                onBrowse={() => { endFlow(); router.push("/monologues"); }}
                onOwnSides={() => { endFlow(); router.push("/practice"); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * The beat between the answers and the picks: a lamp drawing itself in, and a
 * pool of light landing on the floor. Shown while the profile is written and
 * again while the first search runs, so the two reads as one wait.
 */
function SettingTheStage() {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    // Advance and hold: a slow search must not loop back to "(reading your
    // answers.)" after it has already said "(almost.)".
    const t = setInterval(() => setBeat((b) => Math.min(BEATS.length - 1, b + 1)), 900);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative px-7 pb-[60px] pt-14 text-center">
      <LampSketch size={96} draw className="mx-auto block" />
      <p className="mt-6 leading-none tracking-[-0.01em]" style={{ fontFamily: "var(--t-display)", fontSize: 32 }}>
        Setting your stage.
      </p>
      <p
        className="mt-2.5 text-[13px] italic tracking-[0.06em]"
        style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
      >
        {BEATS[beat]}
      </p>
    </div>
  );
}

/** A monologue's play, bound as a spine: its cloth and its emblem, at list size. */
function Spine({ m }: { m: Monologue }) {
  const title = m.play_title || m.title;
  const cloth = clothFor(title);
  const emblem = emblemFor({
    genre: m.genre,
    category: m.category,
    themes: m.themes,
    title,
    author: m.author,
  });
  return (
    <span
      aria-hidden
      className="flex h-[50px] w-[34px] shrink-0 items-center justify-center rounded-[3px]"
      style={{ background: cloth.bg, color: cloth.ink, boxShadow: "2px 2px 0 var(--t-hard-shadow)" }}
    >
      <Glyph name={emblem} size={22} stroke={4} />
    </span>
  );
}

/** The picks for the payoff. Never throws: an empty list is a real answer here. */
async function fetchPicks(answers: OnboardingAnswers): Promise<Monologue[]> {
  try {
    // Six, not three. The payoff is a collection-building moment now rather
    // than a pick-one, and three rows where every row is worth keeping is a
    // thin start to a collection.
    let res = await api.get<{ results: Monologue[]; total: number }>(
      `/api/monologues/search?${buildPayoffParams(answers, { limit: 6 })}`
    );
    let list = res.data.results ?? [];
    if (!list.length) {
      // Thin-results fallback: drop the narrowing filters, keep gender+age.
      res = await api.get<{ results: Monologue[]; total: number }>(
        `/api/monologues/search?${buildPayoffParams(answers, { limit: 6, broad: true })}`
      );
      list = res.data.results ?? [];
    }
    return list;
  } catch {
    return [];
  }
}

function OnboardingPayoff({
  answers,
  items,
  onKeep,
  onBrowse,
  onClose,
  onOwnSides,
}: {
  answers: OnboardingAnswers;
  items: Monologue[];
  onKeep: (ids: number[]) => void;
  onBrowse: () => void;
  onClose: () => void;
  onOwnSides: () => void;
}) {
  const summary = describeAnswers(answers);
  /* Everything starts selected. These are the pieces the actor just described
     to me in five taps, so the question is which ones they DON'T want, not
     whether they want any — and an empty-by-default list makes the whole
     payoff a form to fill in. */
  const [keep, setKeep] = useState<number[]>(() => items.map((m) => m.id));

  if (!items.length) {
    return (
      <div className="relative px-7 pb-[26px] pt-[22px]">
        <p className="m-0 text-[13px] italic tracking-[0.08em]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}>
          (the profile is set.)
        </p>
        <h2 className="mt-2 font-normal leading-none tracking-[-0.02em]" style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)" }}>
          Search leans <em className="italic" style={{ color: "var(--acc)" }}>your way</em> now.
        </h2>
        <p className="mt-2.5 text-sm leading-normal" style={{ color: "var(--t-muted-dark)" }}>
          Nothing in the library matched every filter at once. Bring in the sides you&apos;re actually working on, or go looking.
        </p>
        <div className="mt-6">
          <CtaPill onClick={onOwnSides}>Upload a script</CtaPill>
        </div>
        <div className="mt-4 flex justify-between gap-3 text-xs italic tracking-[0.06em]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}>
          <FootLink onClick={onBrowse}>browse the library</FootLink>
          <FootLink onClick={onClose}>i&apos;ll explore on my own</FootLink>
        </div>
      </div>
    );
  }

  const count = COUNT_WORD[items.length] ?? String(items.length);

  return (
    <div className="relative px-7 pb-[26px] pt-[22px]">
      <p className="m-0 text-[13px] italic tracking-[0.08em]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}>
        (picked for {summary || "you"}.)
      </p>
      <h2 className="mt-2 font-normal leading-none tracking-[-0.02em]" style={{ fontFamily: "var(--t-display)", fontSize: "clamp(1.9rem, 4.5vw, 2.6rem)" }}>
        {count} {items.length === 1 ? "piece" : "pieces"}{" "}
        <em className="italic" style={{ color: "var(--acc)" }}>for you.</em>
      </h2>
      <p className="mt-2 text-sm leading-normal" style={{ color: "var(--t-muted-dark)" }}>
        Keeping them puts them in your collection. Nothing to read yet, they
        just wait for you there.
      </p>

      <ul className="mt-5 flex list-none flex-col gap-2.5 p-0">
        {items.map((m, i) => {
          const mins = Math.max(1, Math.round((m.estimated_duration_seconds || 0) / 60));
          const meta = [m.play_title, m.tone, `${mins} min`].filter(Boolean).join(" · ");
          return (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: SPRING, delay: 0.1 + i * 0.12 }}
              whileHover={{ x: 4 }}
              className="flex items-center gap-3.5 rounded-2xl border-[1.5px] py-3 pl-3.5 pr-3 transition-colors"
              style={{ borderColor: "var(--t-line-light)", background: "var(--t-paper)" }}
            >
              <Spine m={m} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold leading-tight" style={{ fontFamily: "var(--t-direction)" }}>
                  {m.character_name || m.title}
                </span>
                <span
                  className="mt-0.5 block truncate text-xs"
                  style={{ fontFamily: "var(--t-direction)", color: "var(--t-muted-dark-2)" }}
                >
                  {meta}
                </span>
              </span>
              {/* Selected is the gel fill, which is the same "this one is
                  chosen" the question tiles use, so the payoff reads in the
                  vocabulary the last five screens taught. --t-on-gel, never
                  --t-text: cream ink on gel yellow is the one unreadable pair
                  on this card. */}
              {(() => {
                const on = keep.includes(m.id);
                return (
                  /* A mark, not a labelled pill. Everything starts kept, so six
                     filled gel pills down the card put the loudest colour on
                     the screen six times and left the actual decision, the CTA,
                     competing with them. A tick is the same vocabulary at a
                     sixth of the weight. */
                  <motion.button
                    type="button"
                    onClick={() => setKeep((cur) => toggle(cur, m.id))}
                    aria-pressed={on}
                    aria-label={on ? `Keeping ${m.character_name || m.title}` : `Keep ${m.character_name || m.title}`}
                    whileHover={{ scale: 1.08 }}
                    transition={{ duration: 0.3, ease: SPRING }}
                    className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full border-[1.5px]"
                    style={
                      on
                        ? { background: "var(--t-gel)", color: "var(--t-on-gel)", borderColor: "var(--t-on-gel)" }
                        : { background: "transparent", color: "var(--t-faint)", borderColor: "var(--t-line-light)" }
                    }
                  >
                    {on ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    )}
                  </motion.button>
                );
              })()}
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-5">
        {/* No pending state. The saves are fired and not awaited, so this
            closes on the tap — a spinner here would be the card asking the
            actor to watch it finish its own paperwork. */}
        <CtaPill onClick={() => onKeep(keep)}>
          {keep.length === 0
            ? "Take me to the library"
            : keep.length === items.length
              ? "Keep them all"
              : `Keep ${keep.length}`}
        </CtaPill>
      </div>

      {/* The other job entirely, and the one the product is actually for: they
          have sides for a real audition. Until now nothing in the new-user path
          pointed here, which is most of why 10 people have ever uploaded. */}
      <div
        className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t-[1.5px] border-dashed pt-4"
        style={{ borderColor: "color-mix(in oklab, var(--t-text) 25%, transparent)" }}
      >
        <p className="m-0 text-sm">Or bring sides you&apos;re already working on.</p>
        <motion.button
          type="button"
          onClick={onOwnSides}
          whileHover={{ rotate: 1.5 }}
          transition={{ duration: 0.3, ease: SPRING }}
          className="inline-flex h-[38px] items-center gap-2 rounded-full border-[1.5px] border-dashed px-3.5 text-[13px] font-bold transition-colors hover:border-solid"
          style={{ borderColor: "var(--t-text)", color: "var(--t-text)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--t-gel)";
            e.currentTarget.style.color = "var(--t-on-gel)";
            e.currentTarget.style.borderColor = "var(--t-on-gel)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--t-text)";
            e.currentTarget.style.borderColor = "var(--t-text)";
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
          </svg>
          Upload a script
        </motion.button>
      </div>

      <div className="mt-4 flex justify-between gap-3 text-xs italic tracking-[0.06em]" style={{ fontFamily: "var(--t-direction)", color: "var(--t-faint)" }}>
        <FootLink onClick={onBrowse}>browse the library</FootLink>
        <FootLink onClick={onClose}>i&apos;ll explore on my own</FootLink>
      </div>
    </div>
  );
}

function FootLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-inherit underline underline-offset-4 transition-colors"
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--t-text)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "inherit")}
    >
      {children}
    </button>
  );
}
