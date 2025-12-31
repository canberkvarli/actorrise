import { LoginForm } from "@/components/auth/LoginForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-md space-y-12">
        <div>
          <Button asChild variant="ghost" className="gap-2 -ml-4">
            <Link href="/">
              <IconArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <div className="space-y-12">
          <div className="space-y-4">
            <h1 className="text-6xl font-bold tracking-tight">ACTORRISE</h1>
            <p className="text-xl text-muted-foreground">Sign in to your account</p>
          </div>
          <LoginForm />
          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              Don&apos;t have an account?{" "}
            </span>
            <Link href="/signup" className="font-bold hover:underline">
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

