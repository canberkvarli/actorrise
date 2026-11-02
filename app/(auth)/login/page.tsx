import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { TheatreAuthShell } from "@/components/auth/TheatreAuthShell";
import { T } from "@/lib/i18n";

export default function LoginPage() {
  return (
    <>
      {/* Was middleware; moved here so this static page stops billing compute
          on every request. See RedirectIfAuthed. */}
      <RedirectIfAuthed />
      <TheatreAuthShell
        direction={<T k="auth.loginDirection" />}
        title={<T k="auth.loginTitle" />}
        footer={
          <>
            <span><T k="auth.noAccount" /></span>
            <AuthSwitchLink href="/signup"><T k="auth.signUp" /></AuthSwitchLink>
          </>
        }
      >
        {/* Three options: Google, Apple, Sign in with email (expandable).
            A returning sign-in lands on the Collection — the saved pieces they
            came back for (H-14 retention). ?redirect= still wins for deep
            links (a Green Room invite, checkout). New signups keep /practice.
            Since the audition tracker, /auditions/next decides: the prep room when one is inside 14 days, else the Collection. */}
        <AuthProgressiveDisclosure mode="login" redirectTo="/auditions/next" />
      </TheatreAuthShell>
    </>
  );
}
