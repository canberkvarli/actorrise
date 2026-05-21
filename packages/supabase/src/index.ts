/**
 * @actorrise/supabase — shared Supabase plumbing.
 *
 * Web continues to use its own SSR-aware clients in apps/web/lib/ because
 * those are tightly coupled to next/headers cookies(). Sharing them across
 * the monorepo would mean dragging Next.js into the package's peer deps.
 *
 * This package exists for the mobile client (see ./mobile) and to give a
 * single home for any future shared Supabase utilities (e.g. an Edge
 * Function helper, an admin client for backend tooling).
 */
export type { Database } from "@actorrise/types";
