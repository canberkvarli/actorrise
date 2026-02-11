import { SignupForm } from "@/components/auth/SignupForm";
import { OAuthButtons, OAuthDivider } from "@/components/auth/OAuthButtons";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
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
            <div className="flex items-center justify-center gap-3">
              <Image
                src="/logo.png"
                alt="ActorRise"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <h1 className="font-brand text-3xl font-semibold tracking-tight">ActorRise</h1>
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">Create your account</p>
              <p className="text-sm text-muted-foreground">
                Start free. Upgrade anytime.
              </p>
            </div>
          </div>

          {/* OAuth buttons */}
          <OAuthButtons redirectTo="/onboarding" />

          {/* Divider */}
          <OAuthDivider />

          {/* Email/password form */}
          <SignupForm />

          {/* Sign in link */}
          <div className="text-center text-sm text-muted-foreground pt-2">
            <span>Already have an account? </span>
            <Link href="/login" className="font-medium text-primary hover:underline underline-offset-4">
              Sign in
            </Link>
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
