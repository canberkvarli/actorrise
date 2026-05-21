"use client";

import { useEffect, useState } from "react";

interface PracticeGreetingProps {
  /** User's display name (full name). The first token is used as the first name. */
  name?: string | null;
}

/**
 * Time-of-day aware editorial greeting.
 *
 * - Before 12pm: "Good morning, {firstName}."
 * - 12pm to 5pm: "Good afternoon, {firstName}."
 * - 5pm to 10pm: "Good evening, {firstName}."
 * - After 10pm:  "Still working, {firstName}?"
 *
 * If no first name, renders "Welcome back." (no name).
 *
 * Renders a stable placeholder on the server to avoid hydration mismatch,
 * then swaps to the time-aware string after mount.
 */
export function PracticeGreeting({ name }: PracticeGreetingProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard
    setMounted(true);
  }, []);

  const firstName = (name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = mounted ? buildGreeting(new Date().getHours(), firstName) : "Welcome back.";

  return (
    <h1 className="font-serif text-3xl md:text-5xl tracking-tight text-foreground leading-[1.1]">
      {greeting}
    </h1>
  );
}

function buildGreeting(hour: number, firstName: string): string {
  if (!firstName) return "Welcome back.";
  if (hour < 12) return `Good morning, ${firstName}.`;
  if (hour < 17) return `Good afternoon, ${firstName}.`;
  if (hour < 22) return `Good evening, ${firstName}.`;
  return `Still working, ${firstName}?`;
}

export default PracticeGreeting;
