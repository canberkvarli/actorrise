import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      {/* Was middleware; moved here so this static page stops billing compute
          on every request. See RedirectIfAuthed. */}
      <RedirectIfAuthed />
      <div className="w-full max-w-md">
        {/* Back button */}
        <div className="mb-8">
          <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
            <Link href="/">
              <IconArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        {/* Card */}
        <div className="border border-border/60 rounded-xl bg-card shadow-sm px-8 py-10 space-y-8">
          {/* Header with logo */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <BrandLogo size="auth" iconOnly />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">Create your account</p>
              <p className="text-sm text-muted-foreground">
                Start free. Upgrade anytime.
              </p>
            </div>
          </div>

          {/* Three options: Google, Apple, Continue with email (expandable) */}
          {/* A new account lands on the search, not on the script shelf.
              /practice opens on "Your first scene starts here. Bring in a
              script", so the first thing we ask a stranger for is a file they
              may not have, for the half of the product 17 people used last
              month. The other half, monologue search, is where 105 of the 116
              actors who rehearsed anything in the last 30 days went, and 240
              of the 242 who searched opened a piece. Measured 2026-09-07:
              signup -> ever searched has fallen 90% (May) to 52% (September)
              while search -> rehearsed climbed 3% to 36%, so the way in is
              what is leaking, not what happens after it.
              ?redirect= still wins for deep links. */}
          <AuthProgressiveDisclosure mode="signup" redirectTo="/monologues" />

          {/* Sign in link */}
          <div className="text-center text-sm text-muted-foreground pt-2">
            <span>Already have an account? </span>
            <AuthSwitchLink href="/login">Sign in</AuthSwitchLink>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/60 mt-6">
          By continuing, you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
