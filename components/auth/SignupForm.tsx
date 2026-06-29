"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconLoader2, IconEye, IconEyeOff } from "@tabler/icons-react";
import { trackSignupCompleted } from "@/lib/analytics";

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type SignupFormData = z.infer<typeof signupSchema>;

export function SignupForm() {
  const { signup } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setError(null);
    setIsLoading(true);
    try {
      await signup(data.email, data.password);
      // Track successful signup — infer source from current page path
      const source = typeof window !== "undefined" ? window.location.pathname : "unknown";
      trackSignupCompleted({ source });
    } catch (err: unknown) {
      let errorMessage = "Failed to sign up";
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        errorMessage = axiosError.response?.data?.detail || errorMessage;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            enterKeyHint="next"
            placeholder="you@example.com"
            {...register("email")}
          />
          <p className={`text-xs text-destructive h-4 truncate ${errors.email ? '' : 'invisible'}`}>
            {errors.email?.message ?? '\u00A0'}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              enterKeyHint="go"
              placeholder="At least 6 characters"
              className="pr-10"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
            </button>
          </div>
          <p className={`text-xs text-destructive h-4 truncate ${errors.password ? '' : 'invisible'}`}>
            {errors.password?.message ?? '\u00A0'}
          </p>
        </div>

        <div className={`overflow-hidden transition-all duration-200 ${error ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
          <p className="text-sm text-destructive pb-1">{error}</p>
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <IconLoader2 className="h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </div>
  );
}
