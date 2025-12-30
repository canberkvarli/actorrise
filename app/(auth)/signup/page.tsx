import { SignupForm } from "@/components/auth/SignupForm";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconArrowLeft } from "@tabler/icons-react";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <IconArrowLeft className="h-4 w-4" />
              Back to home
            </Button>
          </Link>
        </div>
        <Card>
          <CardHeader className="text-center space-y-3 pb-8">
            <h1 className="text-4xl font-bold tracking-tight">ACTORRISE</h1>
            <p className="text-base">Create your account</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <SignupForm />
            <div className="text-center text-sm border-t border-border pt-6">
              <span>Already have an account? </span>
              <Link href="/login" className="font-bold hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

