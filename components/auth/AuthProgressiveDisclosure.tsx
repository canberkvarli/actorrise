"use client";

import { useState } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginForm } from "@/components/auth/LoginForm";
import { SignupForm } from "@/components/auth/SignupForm";
import { Suspense } from "react";

type AuthMode = "login" | "signup";

interface AuthProgressiveDisclosureProps {
  mode: AuthMode;
  redirectTo?: string;
}

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

      {showEmailForm && (
        <div className="pt-2 animate-in fade-in duration-200">
          {mode === "login" ? (
            <Suspense
              fallback={
                <div className="h-10 animate-pulse rounded-lg bg-muted" />
              }
            >
              <LoginForm />
            </Suspense>
          ) : (
            <SignupForm />
          )}
        </div>
      )}
    </div>
  );
}
