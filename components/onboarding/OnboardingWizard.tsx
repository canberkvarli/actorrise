"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconMasksTheater,
  IconBook2,
  IconConfetti,
  IconUsers,
  IconUser,
  IconArrowLeft,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useCompleteOnboarding } from "@/hooks/useCompleteOnboarding";

type Goal = "audition" | "class" | "fun";
type Choice = "scene" | "monologue";

const GOALS: { id: Goal; title: string; subtitle: string }[] = [
  { id: "audition", title: "Audition prep", subtitle: "Get off-book and ready for the room." },
  { id: "class", title: "Class / training", subtitle: "Build your craft, scene by scene." },
  { id: "fun", title: "Just for fun", subtitle: "Play with the material you love." },
];

const stepTransition = {
  type: "tween" as const,
  duration: 0.32,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all touch-manipulation ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-background hover:border-foreground/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center transition-colors [&_svg]:size-5 ${
          selected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default function OnboardingWizard() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const complete = useCompleteOnboarding();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [referralSource, setReferralSource] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goTo = useCallback((next: number) => {
    setDirection(next > 0 ? 1 : -1);
    setStep((s) => Math.max(0, s + next));
  }, []);

  const finish = useCallback(
    async (target: string | null) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        await complete.mutateAsync({ referral_source: referralSource });
        await refreshUser();
        if (target) router.push(target);
      } catch {
        // On failure, allow the user to retry rather than trapping them.
        setSubmitting(false);
      }
    },
    [submitting, complete, referralSource, refreshUser, router]
  );

  const handleSkip = useCallback(() => {
    finish("/practice");
  }, [finish]);

  const handleStart = useCallback(() => {
    // "scene" maps to My Scripts (where scene rehearsal lives); monologue to search.
    const target = choice === "monologue" ? "/monologues" : "/practice";
    finish(target);
  }, [choice, finish]);

  const dotCount = 3;
  const dots = useMemo(() => Array.from({ length: dotCount }), []);

  // Render nothing (no flicker) until auth resolves, and only show for users
  // who explicitly have not completed onboarding.
  if (loading || !user || user.has_completed_onboarding !== false) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="relative my-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
        <button
          type="button"
          onClick={handleSkip}
          disabled={submitting}
          className="absolute right-4 top-4 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Skip
        </button>

        {/* Progress dots */}
        <div className="mb-6 flex items-center gap-1.5" aria-hidden>
          {dots.map((_, i) => (
            <span
              key={i}
              className={`h-1 transition-all ${
                i === step ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        <div className="relative">
          <AnimatePresence mode="wait" custom={direction}>
            {step === 0 && (
              <motion.div
                key="step-welcome"
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={stepTransition}
              >
                <h2 className="font-brand text-2xl font-semibold text-foreground">
                  Welcome to ActorRise
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  A calmer place to rehearse. Tell me what brings you here so the work feels
                  like yours.
                </p>

                <div className="mt-6 space-y-2.5">
                  {GOALS.map((g) => (
                    <ChoiceCard
                      key={g.id}
                      selected={goal === g.id}
                      onClick={() => setGoal((cur) => (cur === g.id ? null : g.id))}
                      title={g.title}
                      subtitle={g.subtitle}
                      icon={
                        g.id === "audition" ? (
                          <IconMasksTheater />
                        ) : g.id === "class" ? (
                          <IconBook2 />
                        ) : (
                          <IconConfetti />
                        )
                      }
                    />
                  ))}
                </div>

                <div className="mt-6">
                  <Label htmlFor="referral-source" className="text-xs text-muted-foreground">
                    How did you hear about us? (optional)
                  </Label>
                  <Input
                    id="referral-source"
                    value={referralSource}
                    onChange={(e) => setReferralSource(e.target.value)}
                    placeholder="A friend, Instagram, my acting class..."
                    className="mt-1.5"
                  />
                </div>

                <Button
                  onClick={() => goTo(1)}
                  className="mt-7 w-full rounded-full"
                  size="lg"
                >
                  Continue
                </Button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-pick"
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={stepTransition}
              >
                <h2 className="font-brand text-2xl font-semibold text-foreground">
                  Pick something to rehearse
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Start with whatever feels right. You can always switch later.
                </p>

                <div className="mt-6 space-y-2.5">
                  <ChoiceCard
                    selected={choice === "scene"}
                    onClick={() => setChoice("scene")}
                    title="A scene"
                    subtitle="Hamlet & Ophelia"
                    icon={<IconUsers />}
                  />
                  <ChoiceCard
                    selected={choice === "monologue"}
                    onClick={() => setChoice("monologue")}
                    title="A monologue"
                    subtitle="Just you and the words."
                    icon={<IconUser />}
                  />
                </div>

                <div className="mt-7 flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => goTo(-1)}
                    className="rounded-full"
                    aria-label="Back"
                  >
                    <IconArrowLeft />
                    Back
                  </Button>
                  <Button onClick={() => goTo(1)} className="flex-1 rounded-full" size="lg">
                    Continue
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-done"
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={stepTransition}
              >
                <h2 className="font-brand text-2xl font-semibold text-foreground">
                  You&apos;re all set.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {choice === "monologue"
                    ? "Let's find a monologue worth living in."
                    : "Let's get you into a scene. Take your time."}
                </p>

                <div className="mt-7 flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => goTo(-1)}
                    disabled={submitting}
                    className="rounded-full"
                    aria-label="Back"
                  >
                    <IconArrowLeft />
                    Back
                  </Button>
                  <Button
                    onClick={handleStart}
                    disabled={submitting}
                    className="flex-1 rounded-full"
                    size="lg"
                  >
                    {submitting ? "Setting up..." : "Start rehearsing"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
