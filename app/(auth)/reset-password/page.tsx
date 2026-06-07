"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconCircleCheck } from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // After /auth/callback exchanged the recovery code, a session should exist.
    // A PASSWORD_RECOVERY event can also arrive slightly later, so listen too.
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus("ready");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setStatus("ready");
    });
    // If no session shows up shortly, treat the link as invalid/expired.
    const timer = setTimeout(() => {
      if (active) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 2500);
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => router.push("/practice"), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update your password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="border border-border/60 rounded-xl bg-card shadow-sm px-8 py-10 space-y-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center">
              <BrandLogo size="auth" iconOnly />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-foreground">
                {done ? "Password updated" : "Set a new password"}
              </p>
              {!done && status === "ready" && (
                <p className="text-sm text-muted-foreground">
                  Choose a new password for your account.
                </p>
              )}
            </div>
          </div>

          {status === "checking" && (
            <p className="text-center text-sm text-muted-foreground">Verifying your link…</p>
          )}

          {status === "invalid" && !done && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          )}

          {status === "ready" && !done && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}

          {done && (
            <div className="space-y-3 text-center">
              <div className="flex justify-center">
                <IconCircleCheck className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                You&apos;re all set — taking you to your dashboard…
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
