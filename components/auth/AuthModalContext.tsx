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
import Image from "next/image";
import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { theatreFontVars } from "@/lib/fonts/theatre";

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

/* The eyebrow carries the reassurance, so the card needs two lines of copy
   rather than three. On signup that is the same promise the hero footnote
   makes; a visitor who tapped the CTA has just read it. */
const DIRECTIONS: Record<AuthModalMode, string> = {
  signup: "(free to start. no card.)",
  login: "(the ghost light is still on.)",
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
        <DialogContent
          className={`theatre-tokens theatre-auth ${theatreFontVars} w-[calc(100vw-2rem)] max-w-md max-h-[90dvh] overflow-y-auto overflow-x-hidden overscroll-contain border-0 p-6 sm:p-7`}
          style={{
            background: "var(--t-ink)",
            borderRadius: 28,
            boxShadow:
              "0 0 0 1.5px oklch(0.35 0.03 55 / .5), 0 40px 120px -30px oklch(0.72 0.17 55 / .45)",
          }}
        >
          <DialogHeader className="space-y-0">
            <div className="flex justify-center">
              <Image
                src="/transparent_textlogo.png"
                alt="ActorRise"
                width={2000}
                height={600}
                className="h-9 w-auto"
              />
            </div>
            <p className="t-dir pt-4 text-center" style={{ color: "var(--t-muted-light)" }}>
              {DIRECTIONS[mode]}
            </p>
            <DialogTitle
              className="pt-2 text-center"
              style={{
                fontFamily: "var(--t-display)",
                fontWeight: 400,
                fontSize: "clamp(1.9rem, 7vw, 2.4rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "var(--t-cream)",
              }}
            >
              {title}
            </DialogTitle>
            {/* The title and the eyebrow say it. This stays for screen readers
                rather than adding a third line of chrome to a signup card. */}
            <DialogDescription className="sr-only">{description}</DialogDescription>
          </DialogHeader>

          <div className="t-auth-tabs mt-5">
            <button
              type="button"
              data-theatre-tab
              data-active={mode === "signup"}
              className="t-auth-tab"
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
            <button
              type="button"
              data-theatre-tab
              data-active={mode === "login"}
              className="t-auth-tab"
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
          </div>

          <div className="mt-5">
            <AuthProgressiveDisclosure mode={mode} redirectTo="/practice" />
          </div>
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  );
}
