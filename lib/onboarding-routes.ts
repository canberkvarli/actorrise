/**
 * Where the profile onboarding stays out of the way.
 *
 * Someone on the ScenePartner hub is being handed a scene to answer (see
 * GuidedInvitation), and someone on a rehearsal is mid-scene; a seven-step
 * card about casting and age range on top of either is the wrong first thing.
 * They meet it on the library instead.
 *
 * Two components read this and they must agree: OnboardingWizard (the card)
 * and FirstRunCurtain (the black house that covers the app until the card is
 * done). On 2026-09-26 the card went quiet on /practice alone, and a brand-new
 * account saw a black page there, because the curtain was still waiting for a
 * card that would never come.
 */
const QUIET = /^\/practice(\/|$)|^\/scenes\/[^/]+\/rehearse(\/|$)/;

export function onboardingIsQuietOn(pathname: string | null | undefined): boolean {
  return QUIET.test(pathname || "");
}
