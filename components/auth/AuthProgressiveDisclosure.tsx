"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";

type AuthMode = "login" | "signup";

interface AuthProgressiveDisclosureProps {
  mode: AuthMode;
  redirectTo?: string;
}

const emailFormVariants = {
  hidden: { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

/** Reading ?redirect= needs a Suspense boundary above it, so own that here
 *  instead of trusting every caller to remember. */
export function AuthProgressiveDisclosure(props: AuthProgressiveDisclosureProps) {
  return (
    <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}>
      <AuthProgressiveDisclosureInner {...props} />
    </Suspense>
  );
}

function AuthProgressiveDisclosureInner({
  mode,
  redirectTo: redirectToProp = "/practice",
}: AuthProgressiveDisclosureProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);

  // ?redirect= wins over the caller's default. Middleware sets it when it
  // bounces you off a page that needed auth (a Green Room invite, checkout),
  // and that destination is the whole point of the round trip — the pages
  // pass a static "/practice", which would otherwise silently discard it.
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || redirectToProp;

  const emailButtonLabel =
    mode === "login" ? "Sign in with email" : "Continue with email";

  return (
    <div className="space-y-5">
      <OAuthButtons
        redirectTo={redirectTo}
        variant="stack"
        emailButtonLabel={emailButtonLabel}
        onEmailClick={() => setShowEmailForm(true)}
      />

      <AnimatePresence initial={false}>
        {showEmailForm && (
          <motion.div
            className="pt-2"
            variants={emailFormVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            {mode === "login" ? (
              <Suspense
                fallback={
                  <div className="h-10 animate-pulse rounded-lg bg-muted" />
                }
              >
                <LoginForm redirectTo={redirectTo} />
              </Suspense>
            ) : (
              <SignupForm redirectTo={redirectTo} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
