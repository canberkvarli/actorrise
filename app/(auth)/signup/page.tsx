import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { TheatreAuthShell } from "@/components/auth/TheatreAuthShell";
import { T } from "@/lib/i18n";

export default function SignupPage() {
  return (
    <>
      {/* Was middleware; moved here so this static page stops billing compute
          on every request. See RedirectIfAuthed. */}
      <RedirectIfAuthed />
      <TheatreAuthShell
        direction={<T k="auth.signupDirection" />}
        title={<T k="auth.signupTitle" />}
        footer={
          <>
            <span><T k="auth.haveAccount" /></span>
            <AuthSwitchLink href="/login"><T k="auth.signIn" /></AuthSwitchLink>
          </>
        }
      >
        {/* Three options: Google, Apple, Continue with email (expandable) */}
        {/* A new account lands on the hub: the onboarding card first, then the
            first scene waiting under it. Same as the landing's sign-up, which
            always went there.

            From 2026-09-07 to 2026-09-29 this page sent them to the search
            instead, because the hub then opened on "Bring in a script": the
            first thing a stranger was asked for was a file they may not have.
            That stopped being true on 2026-09-26, when the hub started
            opening on a scene already in progress (GuidedInvitation). The
            reason went, so the detour goes. Canberk, 2026-09-29.
            ?redirect= still wins for deep links. */}
        <AuthProgressiveDisclosure mode="signup" redirectTo="/practice" />
      </TheatreAuthShell>
    </>
  );
}
