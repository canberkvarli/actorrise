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
          <AuthProgressiveDisclosure mode="signup" redirectTo="/practice" />

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
