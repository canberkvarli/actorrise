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
import { useT, type MessageKey } from "@/lib/i18n";

type AuthModalMode = "login" | "signup";

type AuthModalOverrides = {
  title?: string;
  description?: string;
};

/* Keys, not strings: the defaults are translated at render (lib/i18n). A
   caller's override is already in whatever language the caller wrote it. */
const DEFAULT_TITLES: Record<AuthModalMode, MessageKey> = {
  signup: "auth.signupTitle",
  login: "auth.loginTitle",
};

const DEFAULT_DESCRIPTIONS: Record<AuthModalMode, MessageKey> = {
  signup: "auth.signupDescription",
  login: "auth.loginDescription",
};

/* The eyebrow carries the reassurance, so the card needs two lines of copy
   rather than three. On signup that is the same promise the hero footnote
   makes; a visitor who tapped the CTA has just read it. */
const DIRECTIONS: Record<AuthModalMode, MessageKey> = {
  signup: "auth.signupDirection",
  login: "auth.loginDirection",
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
  // The copy follows the mode the modal OPENED in, not the tab, as before.
  const [openedMode, setOpenedMode] = useState<AuthModalMode>("signup");
  const [overrides, setOverrides] = useState<AuthModalOverrides | undefined>(undefined);
  const t = useT();
  const title = overrides?.title ?? t(DEFAULT_TITLES[openedMode]);
  const description = overrides?.description ?? t(DEFAULT_DESCRIPTIONS[openedMode]);

  const openAuthModal = useCallback((m: AuthModalMode, o?: AuthModalOverrides) => {
    setMode(m);
    setOpenedMode(m);
    setOverrides(o);
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
              {t(DIRECTIONS[mode])}
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
              {t("auth.signUp")}
            </button>
            <button
              type="button"
              data-theatre-tab
              data-active={mode === "login"}
              className="t-auth-tab"
              onClick={() => setMode("login")}
            >
              {t("auth.signIn")}
            </button>
          </div>

          <div className="mt-5">
            {/* A sign-in hops through /auditions/next (the prep room when one is
                inside 14 days, else the Collection); a signup keeps /practice.
                A ?redirect= on the URL still wins inside the disclosure. */}
            <AuthProgressiveDisclosure mode={mode} redirectTo={mode === "login" ? "/auditions/next" : "/practice"} />
          </div>
        </DialogContent>
      </Dialog>
    </AuthModalContext.Provider>
  );
}
