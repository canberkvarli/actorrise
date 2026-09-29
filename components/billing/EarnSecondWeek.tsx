"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useTrialWords } from "@/hooks/useTrialWords";

interface EarnSecondWeekProps {
  /** Classes for the link itself. */
  className?: string;
  /**
   * Give these and the link comes wrapped in its own line. Left to the
   * component rather than the host so an earned trial leaves no empty
   * paragraph, and its margin, behind.
   */
  lineClassName?: string;
  lineStyle?: CSSProperties;
}

/**
 * The way to the second week, said once under a price.
 *
 * The trial is a week, and two for an actor who has finished a scene
 * (backend/app/services/trial_length.py). Renders nothing once it is earned:
 * the button above already says two weeks by then.
 *
 * Carries no look of its own. Every host is a different theatre surface, so
 * the host passes the classes in.
 */
export function EarnSecondWeek({
  className = "underline underline-offset-2",
  lineClassName,
  lineStyle,
}: EarnSecondWeekProps) {
  const words = useTrialWords();
  if (words.earned) return null;

  const link = (
    <Link href="/practice" className={className}>
      Finish a scene first and it&rsquo;s two weeks.
    </Link>
  );
  if (!lineClassName && !lineStyle) return link;
  return (
    <p className={lineClassName} style={lineStyle}>
      {link}
    </p>
  );
}
