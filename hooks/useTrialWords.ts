import { useSubscription } from "@/hooks/useSubscription";
import { trialWords, type TrialWords } from "@/lib/trial";

/** The trial this actor would get if they started one now, as words. */
export function useTrialWords(): TrialWords {
  const { subscription } = useSubscription();
  return trialWords(subscription?.trial_days, subscription?.trial_earned ?? false);
}
