"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IconArrowLeft, IconCheck, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { displayableAuthor } from "@/lib/utils";
import api from "@/lib/api";
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
  prompt: "Are you an actor, a teacher, or a student?",
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
  { key: "mediums", prompt: "Where do you want to work?", hint: "Theatre, film, TV — pick any." },
  { key: "stage", prompt: "Where are you in it?", hint: null },
] as const;

type QuestionKey =
  | typeof REFERRAL_QUESTION.key
  | typeof ACCOUNT_TYPE_QUESTION.key
  | typeof PROFILE_QUESTIONS[number]["key"];

// Two-column tiles for the short-label questions; the rest read better stacked.
const TWO_COLUMN_KEYS = new Set<QuestionKey>(["referral", "ageRange", "mediums"]);

function Tile({
  selected,
  onClick,
  label,
  sublabel,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-3 text-left transition-all touch-manipulation ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background hover:border-foreground/40"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {sublabel ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{sublabel}</span>
        ) : null}
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all [&_svg]:size-3.5 ${
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"
        }`}
      >
        <IconCheck />
      </span>
    </button>
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
  const [showPayoff, setShowPayoff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  // Keyed off the question, not its index: the index shifts with `variant`,
  // and shifting positions by hand is how the wrong question ends up gating
  // the wrong answer.
  const stepValid = useMemo(() => {
    switch (questions[step]?.key) {
      case "referral": return !!referral;
      // Optional: Continue stays live with nothing picked, so nobody is stopped
      // at signup by a question that only exists for my own bookkeeping.
      case "accountType": return true;
      case "casting": return !!casting;
      case "ageRange": return !!ageRange;
      case "workOn": return workOn.length > 0;
      case "mediums": return mediums.length > 0;
      case "stage": return !!stage;
      default: return false;
    }
  }, [questions, step, referral, casting, ageRange, workOn, mediums, stage]);


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
    onClose();
    void refreshUser();
  }, [onClose, refreshUser]);

  const handleFinishQuestions = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await persist();
      setDirection(1);
      setShowPayoff(true);
    } catch {
      setSubmitting(false); // let them retry rather than trapping them
    }
  }, [submitting, persist]);

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

  const rehearse = useCallback(
    (id: number) => {
      endFlow();
      // /work = the audio-first rehearsal flow (richer than /memorize); this is
      // the payoff's whole point — drop them straight into rehearsing.
      router.push(`/monologue/${id}/work`);
    },
    [endFlow, router]
  );

  // The one required answer. No Skip on this step: it is a single tap with an
  // "Somewhere else" escape hatch, and an attribution answer cannot be
  // reconstructed later the way the profile ones can. Every step after it
  // stays skippable.
  const referralRequired = variant === "new" && questions[step]?.key === "referral";

  const dots = useMemo(() => Array.from({ length: totalSteps }), [totalSteps]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        className={`relative my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40 sm:p-8 ${
          showPayoff ? "max-w-lg" : "max-w-md"
        }`}
      >
        {!showPayoff && !referralRequired && (
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="absolute right-4 top-4 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {variant === "backfill" ? "Not now" : "Skip"}
          </button>
        )}

        {!showPayoff && (
          <div className="mb-6 flex items-center gap-1.5" aria-hidden>
            {dots.map((_, i) => (
              <span
                key={i}
                className={`h-1 transition-all ${i === step ? "w-6 bg-primary" : "w-2 bg-border"}`}
              />
            ))}
          </div>
        )}

        <div className="relative">
          <AnimatePresence mode="wait" custom={direction}>
            {!showPayoff ? (
              <motion.div
                key={`q-${step}`}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={stepTransition}
              >
                <h2 className="font-sans text-2xl font-semibold text-foreground">
                  {questions[step].prompt}
                </h2>
                {questions[step].hint ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {questions[step].hint}
                  </p>
                ) : null}

                <div className={`mt-6 ${TWO_COLUMN_KEYS.has(questions[step].key) ? "grid grid-cols-2 gap-2.5" : "space-y-2.5"}`}>
                  {questions[step].key === "referral" &&
                    REFERRAL_SOURCES.map((r) => (
                      <Tile key={r.id} label={r.label} selected={referral === r.id} onClick={() => chooseReferral(r.id)} />
                    ))}
                  {questions[step].key === "referral" && referral === "other" && (
                    <input
                      type="text"
                      value={referralDetail}
                      onChange={(e) => setReferralDetail(e.target.value)}
                      onBlur={saveReferralDetail}
                      maxLength={280}
                      autoFocus
                      placeholder="Where'd you hear about me? (optional)"
                      className="col-span-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
                    />
                  )}
                  {questions[step].key === "accountType" &&
                    ACCOUNT_TYPES.map((a) => (
                      <Tile key={a.id} label={a.label} selected={accountType === a.id} onClick={() => chooseAccountType(a.id)} />
                    ))}
                  {/* The offer, at the only moment someone volunteers that they
                      teach. A rule in the brand orange rather than a boxed
                      callout: this is an aside in their own flow, not an ad
                      interrupting it. */}
                  {questions[step].key === "accountType" && (accountType === "educator" || accountType === "student") && (
                    <div className="space-y-3 border-l-2 border-primary bg-primary/5 py-3 pl-4 pr-3">
                      <p className="text-sm leading-relaxed text-foreground">
                        {accountType === "educator" ? (
                          <>
                            Then it&apos;s on me. Plus is free for you and for your students.
                            Email me at{" "}
                            <span className="font-medium text-primary">canberk@actorrise.com</span>{" "}
                            with their addresses and I&apos;ll set the whole class up at once.
                          </>
                        ) : (
                          <>
                            Plus is free for students. Get your teacher to email me at{" "}
                            <span className="font-medium text-primary">canberk@actorrise.com</span>{" "}
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
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
                      />
                    </div>
                  )}
                  {questions[step].key === "casting" &&
                    CASTING.map((c) => (
                      <Tile key={c.id} label={c.label} selected={casting === c.id} onClick={() => setCasting(c.id)} />
                    ))}
                  {questions[step].key === "ageRange" &&
                    AGE_RANGES.map((a) => (
                      <Tile key={a} label={a.replace("-", "–")} selected={ageRange === a} onClick={() => setAgeRange(a)} />
                    ))}
                  {questions[step].key === "workOn" &&
                    WORK_ON.map((w) => (
                      <Tile key={w.id} label={w.label} selected={workOn.includes(w.id)} onClick={() => setWorkOn((cur) => toggle(cur, w.id))} />
                    ))}
                  {questions[step].key === "mediums" &&
                    MEDIUMS.map((m) => (
                      <Tile key={m.id} label={m.label} selected={mediums.includes(m.id)} onClick={() => setMediums((cur) => toggle(cur, m.id))} />
                    ))}
                  {questions[step].key === "stage" &&
                    CAREER_STAGES.map((s) => (
                      <Tile key={s.id} label={s.label} selected={stage === s.id} onClick={() => setStage(s.id)} />
                    ))}
                </div>

                <div className="mt-7 flex items-center gap-3">
                  {step > 0 && (
                    <Button variant="ghost" onClick={() => goTo(-1)} disabled={submitting} className="rounded-full" aria-label="Back">
                      <IconArrowLeft />
                      Back
                    </Button>
                  )}
                  {step < totalSteps - 1 ? (
                    <Button onClick={() => goTo(1)} disabled={!stepValid} className="flex-1 rounded-full" size="lg">
                      Continue
                    </Button>
                  ) : (
                    <Button onClick={handleFinishQuestions} disabled={!stepValid || submitting} className="flex-1 rounded-full" size="lg">
                      {submitting ? "Finding your monologues…" : "Show me my monologues"}
                    </Button>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="payoff"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={stepTransition}
              >
                <OnboardingPayoff
                  answers={answers}
                  onRehearse={rehearse}
                  onClose={endFlow}
                  onBrowse={() => { endFlow(); router.push("/monologues"); }}
                  onOwnSides={() => { endFlow(); router.push("/practice"); }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function OnboardingPayoff({
  answers,
  onRehearse,
  onBrowse,
  onClose,
  onOwnSides,
}: {
  answers: OnboardingAnswers;
  onRehearse: (id: number) => void;
  onBrowse: () => void;
  onClose: () => void;
  onOwnSides: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "empty">("loading");
  const [items, setItems] = useState<Monologue[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let res = await api.get<{ results: Monologue[]; total: number }>(
          `/api/monologues/search?${buildPayoffParams(answers)}`
        );
        let list = res.data.results ?? [];
        if (!list.length) {
          // Thin-results fallback: drop the narrowing filters, keep gender+age.
          res = await api.get<{ results: Monologue[]; total: number }>(
            `/api/monologues/search?${buildPayoffParams(answers, { broad: true })}`
          );
          list = res.data.results ?? [];
        }
        if (cancelled) return;
        setItems(list);
        setPhase(list.length ? "ready" : "empty");
      } catch {
        if (!cancelled) setPhase("empty");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [answers]);

  const summary = describeAnswers(answers);

  if (phase === "loading") {
    return (
      <div className="py-10 text-center">
        <p className="font-sans text-xl font-semibold text-foreground">Setting your stage…</p>
        <p className="mt-2 text-sm text-muted-foreground">Pulling monologues that fit you.</p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div>
        <h2 className="font-sans text-2xl font-semibold text-foreground">Your profile&apos;s set.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Search will lean toward your type from here on. Let&apos;s find something to rehearse.
        </p>
        <Button onClick={onOwnSides} className="mt-6 w-full rounded-full" size="lg">
          Bring in your own sides
        </Button>
        <button
          type="button"
          onClick={onBrowse}
          className="mt-3 w-full text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Browse the library
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-sans text-2xl font-semibold text-foreground">
        {items.length === 1 ? "A monologue for you" : `${items.length} monologues for you`}
      </h2>
      {summary ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Picked for {summary}.</p>
      ) : null}

      <ul className="mt-5 space-y-3">
        {items.map((m) => {
          const mins = Math.max(1, Math.round((m.estimated_duration_seconds || 0) / 60));
          const meta = [m.character_name, m.tone, `${mins} min`].filter(Boolean).join(" · ");
          return (
            <li key={m.id} className="border border-border bg-background p-4">
              <p className="font-sans text-lg font-semibold leading-tight text-foreground">{m.title}</p>
              {displayableAuthor(m.author) && (
                <p className="mt-0.5 text-xs text-muted-foreground">{displayableAuthor(m.author)}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{meta}</p>
              <Button onClick={() => onRehearse(m.id)} size="sm" className="mt-3 rounded-full">
                <IconPlayerPlayFilled className="size-3.5" />
                Rehearse
              </Button>
            </li>
          );
        })}
      </ul>

      {/* The other job entirely, and the one the product is actually for: they
          have sides for a real audition. Until now nothing in the new-user path
          pointed here, which is most of why 10 people have ever uploaded. */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm text-foreground">Or bring sides you&apos;re already working on.</p>
        <Button onClick={onOwnSides} variant="outline" size="sm" className="mt-3 rounded-full">
          Upload a script
        </Button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button type="button" onClick={onBrowse} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Browse more
        </button>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          I&apos;ll explore on my own
        </button>
      </div>
    </div>
  );
}
