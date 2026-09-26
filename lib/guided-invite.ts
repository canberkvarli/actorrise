/**
 * Whether /practice opens on the guided first scene instead of the shelf.
 *
 * A rule, not a redirect: the hub renders a different page for this actor and
 * never yanks anyone anywhere (the old first-run gate did, and it cost a real
 * actor a hijacked session on 2026-09-23).
 *
 * has_ever_rehearsed is computed from the ScenePartner meter, which the guided
 * endpoint does not charge, so has_seen_first_rehearsal (set by that endpoint)
 * is what remembers a guided run that was started but not finished.
 */
export interface InviteUser {
  has_ever_rehearsed?: boolean;
  has_seen_first_rehearsal?: boolean;
}

export function shouldInvite(
  user: InviteUser | null | undefined,
  ownScriptCount: number,
  isDemoUser: boolean,
): boolean {
  if (!user || isDemoUser) return false;
  // A stale cached user missing the field is unknown, not "never rehearsed".
  if (user.has_ever_rehearsed !== false) return false;
  if (user.has_seen_first_rehearsal === true) return false;
  return ownScriptCount === 0;
}
