"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { IconLoader2 } from "@tabler/icons-react";
import { createBrowserClient } from "@supabase/ssr";
import { motion, AnimatePresence } from "framer-motion";
import { getStoredLastAuthMethod, PENDING_OAUTH_PROVIDER_KEY, type LastAuthMethod } from "@/lib/last-auth-method";

type OAuthProvider = "google" | "apple" | "twitter";

const lastUsedBadgeVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.9, y: 2 },
};

interface OAuthButtonsProps {
  redirectTo?: string;
  /** Stack full-width buttons and show "Sign in with email" trigger */
  variant?: "icons" | "stack";
  /** Label for the email option (e.g. "Sign in with email", "Continue with email") */
  emailButtonLabel?: string;
  /** When user clicks the email option (progressive disclosure) */
  onEmailClick?: () => void;
}

// Brand SVG icons (inline for reliability)
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const providerConfig: Record<
  OAuthProvider,
  {
    label: string;
    icon: React.FC;
  }
> = {
  google: {
    label: "Google",
    icon: GoogleIcon,
  },
  apple: {
    label: "Apple",
    icon: AppleIcon,
  },
  twitter: {
    label: "X",
    icon: XIcon,
  },
};

export function OAuthButtons({
  redirectTo = "/dashboard",
  variant = "icons",
  emailButtonLabel,
  onEmailClick,
}: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProvider | null>(null);
  const [lastUsed, setLastUsed] = useState<LastAuthMethod | null>(null);

  useEffect(() => {
    setLastUsed(getStoredLastAuthMethod());
  }, []);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleOAuthSignIn = async (provider: OAuthProvider) => {
    setLoadingProvider(provider);
    // Store provider so when user lands back after OAuth we can persist "last used" (callback URL params may not be preserved)
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(PENDING_OAUTH_PROVIDER_KEY, provider);
      }
    } catch {
      // ignore
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}&provider=${provider}`,
        },
      });

      if (error) {
        console.error("OAuth error:", error);
        setLoadingProvider(null);
      }
      // If successful, user will be redirected
    } catch (error) {
      console.error("OAuth error:", error);
      setLoadingProvider(null);
    }
  };

  // Only show providers enabled in Supabase (X/Twitter disabled until configured there)
  const providers: OAuthProvider[] = ["google", "apple"];

  const isStack = variant === "stack";

  if (isStack) {
    return (
      <div className="space-y-3">
        {providers.map((provider) => {
          const config = providerConfig[provider];
          const Icon = config.icon;
          const isLoading = loadingProvider === provider;
          const isLastUsed = lastUsed === provider;

          return (
            <div key={provider} className="relative">
              <AnimatePresence mode="wait">
                {isLastUsed && (
                  <motion.span
                    key="badge"
                    className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-600 shadow-sm ring-1 ring-border"
                    variants={lastUsedBadgeVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  >
                    Last used
                  </motion.span>
                )}
              </AnimatePresence>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 rounded-lg border-border hover:bg-muted hover:text-foreground hover:border-foreground/20 transition-all justify-center gap-3"
                onClick={() => handleOAuthSignIn(provider)}
                disabled={loadingProvider !== null}
              >
                {isLoading ? (
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Icon />
                    <span>Continue with {config.label}</span>
                  </>
                )}
              </Button>
            </div>
          );
        })}
        {emailButtonLabel && onEmailClick && (
          <div className="relative">
            <AnimatePresence mode="wait">
              {lastUsed === "email" && (
                <motion.span
                  key="badge-email"
                  className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-10 rounded-full bg-background px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-600 shadow-sm ring-1 ring-border"
                  variants={lastUsedBadgeVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  Last used
                </motion.span>
              )}
            </AnimatePresence>
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 rounded-lg border-border hover:bg-muted hover:text-foreground hover:border-foreground/20 transition-all justify-center gap-3"
              onClick={onEmailClick}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <path d="m22 6-10 7L2 6" />
              </svg>
              <span>{emailButtonLabel}</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {providers.map((provider) => {
        const config = providerConfig[provider];
        const Icon = config.icon;
        const isLoading = loadingProvider === provider;

        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            size="icon"
            onClick={() => handleOAuthSignIn(provider)}
            disabled={loadingProvider !== null}
            className="h-11 w-11 rounded-lg border-border hover:bg-muted hover:border-foreground/20 transition-all"
            title={`Continue with ${config.label}`}
          >
            {isLoading ? (
              <IconLoader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Icon />
            )}
          </Button>
        );
      })}
    </div>
  );
}

// Divider component for separating OAuth from email/password
export function OAuthDivider() {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-3 text-muted-foreground">or</span>
      </div>
    </div>
  );
}
