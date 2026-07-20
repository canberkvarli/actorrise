"use client";

/**
 * Shown when a search explicitly asks for a two-person scene (e.g. "scenes for
 * two actors", "M-M scene", "duologue"). The library is solo monologues only,
 * so this is an honest heads-up instead of silently returning pieces that
 * can't be run with a partner. Non-interactive: sharp corners, one line.
 */
export function SceneGapBanner() {
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-sm">
        You searched for a two-person scene. These are solo monologues, not
        scene partners. Two-person scenes aren&apos;t here yet.
      </p>
    </div>
  );
}
