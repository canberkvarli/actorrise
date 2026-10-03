"use client";

import { useState } from "react";
import Link from "next/link";
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
        isSignup={mode === "signup"}
        variant="stack"
        emailButtonLabel={emailButtonLabel}
        onEmailClick={() => setShowEmailForm(true)}
      />

      {/* On the card itself, before anything is opened. It used to live only
          inside the email form, so someone who could not remember their
          password had to tap "Sign in with email" to find out there was a way
          back in, and on a phone that link was 12px of grey. Once the form is
          open its own link, beside the password field, takes over. */}
      {mode === "login" && !showEmailForm && (
        <p className="text-center">
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center px-2 text-sm underline underline-offset-4 transition-colors hover:text-[var(--t-cream)]"
            style={{ color: "var(--t-muted-light-2)" }}
          >
            Forgot your password?
          </Link>
        </p>
      )}

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
