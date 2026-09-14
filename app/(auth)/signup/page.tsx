import { AuthProgressiveDisclosure } from "@/components/auth/AuthProgressiveDisclosure";
import { AuthSwitchLink } from "@/components/auth/AuthSwitchLink";
import { RedirectIfAuthed } from "@/components/auth/RedirectIfAuthed";
import { TheatreAuthShell } from "@/components/auth/TheatreAuthShell";

export default function SignupPage() {
  return (
    <>
      {/* Was middleware; moved here so this static page stops billing compute
          on every request. See RedirectIfAuthed. */}
      <RedirectIfAuthed />
      <TheatreAuthShell
        direction="(free to start. no card.)"
        title="Create your account"
        footer={
          <>
            <span>Already have an account? </span>
            <AuthSwitchLink href="/login">Sign in</AuthSwitchLink>
          </>
        }
      >
        {/* Three options: Google, Apple, Continue with email (expandable) */}
        {/* A new account lands on the search, not on the script shelf.
            /practice opens on "Your first scene starts here. Bring in a
            script", so the first thing we ask a stranger for is a file they
            may not have, for the half of the product 17 people used last
            month. The other half, monologue search, is where 105 of the 116
            actors who rehearsed anything in the last 30 days went, and 240
            of the 242 who searched opened a piece. Measured 2026-09-07:
            signup -> ever searched has fallen 90% (May) to 52% (September)
            while search -> rehearsed climbed 3% to 36%, so the way in is
            what is leaking, not what happens after it.
            ?redirect= still wins for deep links. */}
        <AuthProgressiveDisclosure mode="signup" redirectTo="/monologues" />
      </TheatreAuthShell>
    </>
  );
}
