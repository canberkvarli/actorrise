/**
 * Shared Zod schemas + domain enums used by both web and mobile.
 *
 * Initial content is the pricing tier enum — both platforms need to read
 * the same set of tiers when displaying paywalls and gating features.
 * Add more shared schemas (search filters, API request/response shapes)
 * as mobile pulls them over from apps/web.
 */
export * from "./pricing";
