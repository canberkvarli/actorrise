"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";

type AuthModalMode = "login" | "signup";

type AuthModalOverrides = {
  title?: string;
  description?: string;
};

const DEFAULT_TITLES: Record<AuthModalMode, string> = {
  signup: "Create your account",
  login: "Welcome back",
};

const DEFAULT_DESCRIPTIONS: Record<AuthModalMode, string> = {
  signup: "Start free. Upgrade anytime.",
  login: "Sign in to continue to your dashboard.",
};

type AuthModalContextValue = {
  openAuthModal: (mode: AuthModalMode, overrides?: AuthModalOverrides) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) return null;
  return ctx;
}

type AuthModalProviderProps = {
  children: ReactNode;
};

export function AuthModalProvider({ children }: AuthModalProviderProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("signup");
  const [title, setTitle] = useState(DEFAULT_TITLES.signup);
  const [description, setDescription] = useState(DEFAULT_DESCRIPTIONS.signup);

  const openAuthModal = useCallback((m: AuthModalMode, overrides?: AuthModalOverrides) => {
    setMode(m);
    setTitle(overrides?.title ?? DEFAULT_TITLES[m]);
    setDescription(overrides?.description ?? DEFAULT_DESCRIPTIONS[m]);
    setOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && closeAuthModal()}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain p-4 sm:p-6">
          <DialogHeader>
            <div className="flex justify-center pt-1 sm:pt-2">
              <BrandLogo size="auth" iconOnly />
            </div>
            <DialogTitle className="text-xl sm:text-2xl text-center pt-2">
              {title}
            </DialogTitle>
            <DialogDescription className="text-center text-sm sm:text-base">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border/50 mb-2">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 min-h-[44px] py-3 sm:py-2.5 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                mode === "signup"
                  ? "bg-primary text-primary-foreground shadow-sm border border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign up
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 min-h-[44px] py-3 sm:py-2.5 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                mode === "login"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign in
            </button>
          </div>
          <AuthProgressiveDisclosure mode={mode} redirectTo="/dashboard" />
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  );
}
