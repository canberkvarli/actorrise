import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";
import { Suspense } from "react";

export default function LoginPage() {
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
            <h1 className="font-serif text-4xl md:text-5xl font-bold tracking-tight">ActorRise</h1>
            <p className="text-sm uppercase tracking-[0.2em] text-primary font-mono">
              Sign in
            </p>
            <p className="text-sm text-muted-foreground">
              Use your email and password to access your dashboard.
            </p>
          </div>
          <Suspense fallback={<div className="h-10 animate-pulse rounded bg-muted" />}>
            <LoginForm />
          </Suspense>
          <div className="text-center text-xs text-muted-foreground">
            <span>Don&apos;t have an account? </span>
            <Link href="/signup" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

