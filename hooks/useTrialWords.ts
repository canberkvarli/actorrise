import { useSubscription } from "@/hooks/useSubscription";
import { tasteDays, trialWords, type TrialWords } from "@/lib/trial";

/** The trial this actor would get if they started one now, as words. */
export function useTrialWords(): TrialWords {
  const { subscription } = useSubscription();
  const taste = subscription?.taste;
  return trialWords(
    subscription?.trial_days,
    subscription?.trial_earned ?? false,
    Boolean(taste?.had && !taste?.active),
    tasteDays(taste),
  );
}
