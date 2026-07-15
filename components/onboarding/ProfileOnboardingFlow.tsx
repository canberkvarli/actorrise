"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IconArrowLeft, IconCheck, IconPlayerPlayFilled } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import type { Monologue } from "@/types/actor";
import {
  AGE_RANGES,
  CASTING,
  WORK_ON,
  MEDIUMS,
  CAREER_STAGES,
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

const QUESTIONS = [
  { key: "casting", prompt: "How are you usually cast?", hint: "So the roles I show you are ones you could actually book." },
  { key: "ageRange", prompt: "What's your playing age?", hint: null },
  { key: "workOn", prompt: "What do you want to work on?", hint: "Pick as many as you like." },
  { key: "mediums", prompt: "Where do you want to work?", hint: "Theatre, film, TV — pick any." },
  { key: "stage", prompt: "Where are you in it?", hint: null },
] as const;

const TOTAL_STEPS = QUESTIONS.length; // 5 taps; payoff is a separate view

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

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [showPayoff, setShowPayoff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [casting, setCasting] = useState<string | null>(null);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [workOn, setWorkOn] = useState<string[]>([]);
  const [mediums, setMediums] = useState<string[]>([]);
  const [stage, setStage] = useState<string | null>(null);

  const answers: OnboardingAnswers = useMemo(
    () => ({ casting, ageRange, workOn, mediums, stage }),
    [casting, ageRange, workOn, mediums, stage]
  );

  const toggle = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const stepValid = useMemo(() => {
    switch (step) {
      case 0: return !!casting;
      case 1: return !!ageRange;
      case 2: return workOn.length > 0;
      case 3: return mediums.length > 0;
      case 4: return !!stage;
      default: return false;
    }
  }, [step, casting, ageRange, workOn, mediums, stage]);

  const goTo = useCallback((delta: number) => {
    setDirection(delta > 0 ? 1 : -1);
    setStep((s) => Math.min(TOTAL_STEPS - 1, Math.max(0, s + delta)));
  }, []);

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

  const dots = useMemo(() => Array.from({ length: TOTAL_STEPS }), []);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        className={`relative my-auto w-full rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40 sm:p-8 ${
          showPayoff ? "max-w-lg" : "max-w-md"
        }`}
      >
        {!showPayoff && (
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
                <h2 className="font-brand text-2xl font-semibold text-foreground">
                  {QUESTIONS[step].prompt}
                </h2>
                {QUESTIONS[step].hint ? (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {QUESTIONS[step].hint}
                  </p>
                ) : null}

                <div className={`mt-6 ${step === 1 || step === 3 ? "grid grid-cols-2 gap-2.5" : "space-y-2.5"}`}>
                  {step === 0 &&
                    CASTING.map((c) => (
                      <Tile key={c.id} label={c.label} selected={casting === c.id} onClick={() => setCasting(c.id)} />
                    ))}
                  {step === 1 &&
                    AGE_RANGES.map((a) => (
                      <Tile key={a} label={a.replace("-", "–")} selected={ageRange === a} onClick={() => setAgeRange(a)} />
                    ))}
                  {step === 2 &&
                    WORK_ON.map((w) => (
                      <Tile key={w.id} label={w.label} selected={workOn.includes(w.id)} onClick={() => setWorkOn((cur) => toggle(cur, w.id))} />
                    ))}
                  {step === 3 &&
                    MEDIUMS.map((m) => (
                      <Tile key={m.id} label={m.label} selected={mediums.includes(m.id)} onClick={() => setMediums((cur) => toggle(cur, m.id))} />
                    ))}
                  {step === 4 &&
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
                  {step < TOTAL_STEPS - 1 ? (
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
                <OnboardingPayoff answers={answers} onRehearse={rehearse} onClose={endFlow} onBrowse={() => { endFlow(); router.push("/monologues"); }} />
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
}: {
  answers: OnboardingAnswers;
  onRehearse: (id: number) => void;
  onBrowse: () => void;
  onClose: () => void;
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
        <p className="font-brand text-xl text-foreground">Setting your stage…</p>
        <p className="mt-2 text-sm text-muted-foreground">Pulling monologues that fit you.</p>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div>
        <h2 className="font-brand text-2xl font-semibold text-foreground">Your profile&apos;s set.</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Search will lean toward your type from here on. Let&apos;s find something to rehearse.
        </p>
        <Button onClick={onBrowse} className="mt-6 w-full rounded-full" size="lg">
          Browse the library
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-brand text-2xl font-semibold text-foreground">
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
              <p className="font-brand text-lg leading-tight text-foreground">{m.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{m.author}</p>
              <p className="mt-2 text-xs text-muted-foreground">{meta}</p>
              <Button onClick={() => onRehearse(m.id)} size="sm" className="mt-3 rounded-full">
                <IconPlayerPlayFilled className="size-3.5" />
                Rehearse
              </Button>
            </li>
          );
        })}
      </ul>

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
