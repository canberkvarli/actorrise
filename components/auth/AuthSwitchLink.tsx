"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface AuthSwitchLinkProps {
  href: "/login" | "/signup";
  children: React.ReactNode;
}

/**
 * The "already have an account?" / "don't have an account?" cross-link between
 * the two auth pages, carrying ?redirect= across. Without it, an invited actor
 * who lands on /login and clicks "Sign up" silently loses the room they were
 * headed for.
 */
export function AuthSwitchLink(props: AuthSwitchLinkProps) {
  return (
    <Suspense fallback={<AuthSwitchAnchor {...props} redirect={null} />}>
      <AuthSwitchLinkInner {...props} />
    </Suspense>
  );
}

function AuthSwitchLinkInner({ href, children }: AuthSwitchLinkProps) {
  const redirect = useSearchParams().get("redirect");
  return <AuthSwitchAnchor href={href} redirect={redirect}>{children}</AuthSwitchAnchor>;
}

function AuthSwitchAnchor({
  href,
  redirect,
  children,
}: AuthSwitchLinkProps & { redirect: string | null }) {
  return (
    <Link
      href={redirect ? `${href}?redirect=${encodeURIComponent(redirect)}` : href}
      className="font-medium text-primary hover:underline underline-offset-4"
    >
      {children}
    </Link>
  );
}
