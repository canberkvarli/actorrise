import { SignupForm } from "@/components/auth/SignupForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-10">
          <Button asChild variant="ghost" className="gap-2 -ml-2">
            <Link href="/">
              <IconArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <div className="border rounded-2xl bg-card shadow-sm px-8 py-10 space-y-10">
          <div className="space-y-3">
            <h1 className="font-brand text-4xl md:text-5xl font-bold tracking-tight">ActorRise</h1>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-mono">
              Create account
            </p>
            <p className="text-sm text-muted-foreground">
              Start with a free account. You can upgrade any time.
            </p>
          </div>
          <SignupForm />
          <div className="text-center text-xs text-muted-foreground">
            <span>Already have an account? </span>
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

