"use client";

interface PracticeActivityBeatsProps {
  /** Number of user-uploaded scripts (excludes the demo). */
  userScriptCount: number;
}

/**
 * Single quiet line of inline activity beats separated by `·`.
 *
 * Currently exposes only the scripts count — no recent-rehearsal or session-minutes
 * data source exists in the codebase yet (see useDashboardData for what IS available).
 *
 * Future beats slot in here:
 *   - "{n} scenes this week"  ← needs a sessions endpoint
 *   - "{n} minutes rehearsed" ← needs a sessions endpoint
 *
 * Hidden entirely when there is nothing to say.
 */
export function PracticeActivityBeats({
  userScriptCount,
}: PracticeActivityBeatsProps) {
  if (userScriptCount <= 0) return null;

  const beats: string[] = [];
  beats.push(
    `${userScriptCount} script${userScriptCount !== 1 ? "s" : ""} in your library`,
  );

  // Future beats appended here as their data sources land.

  return (
    <p className="text-sm text-muted-foreground">
      {beats.join(" · ")}
    </p>
  );
}

export default PracticeActivityBeats;
