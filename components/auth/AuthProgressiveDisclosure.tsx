"use client";

import { useState } from "react";
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

export function AuthProgressiveDisclosure({
  mode,
  redirectTo = "/dashboard",
}: AuthProgressiveDisclosureProps) {
  const [showEmailForm, setShowEmailForm] = useState(false);

  const emailButtonLabel =
    mode === "login" ? "Sign in with email" : "Continue with email";

  return (
    <div className="space-y-6">
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
              <SignupForm />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
