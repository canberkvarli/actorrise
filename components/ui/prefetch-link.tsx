"use client";

/**
 * A Link that prefetches on intent rather than on sight.
 *
 * Next prefetches every Link that scrolls into the viewport, so a grid of 20
 * result cards fired 20 RSC requests for a visitor who clicks at most one. That
 * was a real share of the edge-request bill (/monologue/[id]/work alone took 36k
 * requests in a week, none of them cached).
 *
 * Hovering, focusing or touching a card is a much better predictor of a click
 * than merely scrolling past it, and it still lands well before the click does:
 * a pointer takes a few hundred ms to travel and press. So this keeps
 * navigation feeling instant while prefetching a small fraction as many pages.
 *
 * Prefetch fires once per link. Touch devices get it on touchstart, which is
 * ~100ms before the tap completes, so mobile keeps a head start too.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, type ComponentProps } from "react";

type PrefetchLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

export function PrefetchLink({
  href,
  onMouseEnter,
  onFocus,
  onTouchStart,
  children,
  ...props
}: PrefetchLinkProps) {
  const router = useRouter();
  const prefetched = useRef(false);

  const warm = useCallback(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    // Only same-origin app routes are prefetchable; anything else would throw.
    if (typeof href === "string" && href.startsWith("/")) {
      router.prefetch(href);
    }
  }, [href, router]);

  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
