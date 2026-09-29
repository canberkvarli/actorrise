/**
 * paywall_hit and its two siblings: one shape for every moment a price is shown.
 *
 * Pure on purpose. lib/analytics.ts does the sending; this only says what is
 * sent, so the shape can be tested without a window.
 */

/** wall: a limit said no. ask: something just went well. */
export type PaywallKind = "wall" | "ask";

export type PaywallProps = {
  gate: string;
  kind: PaywallKind;
  surface: string;
  tier_current: string;
  variant?: string;
};

/** The first path segment: which room of the product the price was shown in. */
export function surfaceOf(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0] ?? "home";
}

export function paywallProps(
  gate: string,
  kind: PaywallKind,
  tier: string,
  pathname: string,
  variant?: string,
): PaywallProps {
  const props: PaywallProps = { gate, kind, surface: surfaceOf(pathname), tier_current: tier };
  if (variant) props.variant = variant;
  return props;
}
