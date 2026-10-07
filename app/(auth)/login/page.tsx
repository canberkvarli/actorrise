import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { TheatreAuthShell } from "@/components/auth/TheatreAuthShell";

export default function LoginPage() {
  return (
    <>
      {/* Was middleware; moved here so this static page stops billing compute
          on every request. See RedirectIfAuthed. */}
      <RedirectIfAuthed />
      <TheatreAuthShell
        direction="(the ghost light is still on.)"
        title="Welcome back"
        footer={
          <>
            <span>Don&apos;t have an account? </span>
            <AuthSwitchLink href="/signup">Sign up</AuthSwitchLink>
          </>
        }
      >
        {/* Three options: Google, Apple, Sign in with email (expandable).
            A returning sign-in lands on the Collection — the saved pieces they
            came back for (H-14 retention). ?redirect= still wins for deep
            links (a Green Room invite, checkout). New signups keep /practice. */}
        <AuthProgressiveDisclosure mode="login" redirectTo="/rehearse" />
      </TheatreAuthShell>
    </>
  );
}
