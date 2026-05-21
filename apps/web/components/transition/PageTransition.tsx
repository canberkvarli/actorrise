"use client";

import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const ease = [0.25, 0.1, 0.25, 1] as const;
const duration = 0.4;

/**
 * Wraps page content with a smooth entrance (fade + slight slide up).
 * Pass key (e.g. pathname) so the transition re-runs on every route change.
 */
export function PageTransition({
  children,
  transitionKey,
}: {
  children: React.ReactNode;
  /** When this changes, the entrance animation runs again (e.g. pathname for per-route transition). */
  transitionKey?: string;
}) {
  return (
    <motion.div
      key={transitionKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Client wrapper that keys PageTransition by pathname so every navigation (search, profile, etc.) gets a smooth transition.
 */
export function PageTransitionWithKey({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <PageTransition transitionKey={pathname}>{children}</PageTransition>;
}
