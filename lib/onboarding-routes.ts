/**
 * Where the profile onboarding stays out of the way.
 *
 * One place: a rehearsal. Someone mid-scene is saying lines out loud, and a
 * card about casting and age range on top of that is the wrong thing at the
 * wrong time.
 *
 * The ScenePartner hub used to be on this list too (2026-09-26 to 2026-09-29),
 * so that a new actor met the guided first scene before any questions. But the
 * landing's sign-up sends every new account to the hub, which meant most new
 * actors never saw the onboarding at all: they met it days later, if they ever
 * opened the library. Canberk, 2026-09-29: onboarding first, then the hub with
 * the first scene waiting. So the card shows on the hub now, and the hub holds
 * its invitation until the card is done (app/(platform)/practice/page.tsx).
 *
 * Two components read this and they must agree: OnboardingWizard (the card)
 * and FirstRunCurtain (the black house that covers the app until the card is
 * done). When they disagreed, a brand-new account saw a black page, because
 * the curtain was waiting for a card that would never come.
 */
const QUIET = /^\/scenes\/[^/]+\/rehearse(\/|$)/;

export function onboardingIsQuietOn(pathname: string | null | undefined): boolean {
  return QUIET.test(pathname || "");
}
