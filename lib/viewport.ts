/** The same breakpoint as Tailwind's `md` and hooks/useIsPhone. */
export const PHONE_QUERY = "(max-width: 767.98px)";

type MatchMedia = (q: string) => { matches: boolean };

export function isPhoneViewport(
  mm: MatchMedia | undefined = typeof window !== "undefined" ? window.matchMedia?.bind(window) : undefined,
): boolean {
  return mm ? mm(PHONE_QUERY).matches : false;
}
