import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function LoginPage() {
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
            <div className="flex items-center justify-center">
              <BrandLogo size="auth" iconOnly />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">Welcome back</p>
              <p className="text-sm text-muted-foreground">
                Sign in to continue to your dashboard
              </p>
            </div>
          </div>

          {/* Three options: Google, Apple, Sign in with email (expandable) */}
          <AuthProgressiveDisclosure mode="login" redirectTo="/dashboard" />

          {/* Sign up link */}
          <div className="text-center text-sm text-muted-foreground pt-2">
            <span>Don&apos;t have an account? </span>
            <Link href="/signup" className="font-medium text-primary hover:underline underline-offset-4">
              Sign up
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
