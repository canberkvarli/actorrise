"use client";

import { useCallback, useRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from "react";

type SpotlightSurfaceProps = {
  /** Element to render as (section, header, div…). Default: div. */
  as?: ElementType;
  children?: ReactNode;
  className?: string;
  /** Slow ghost-light flicker on the spotlight layer. */
  flicker?: boolean;
  /** Warm overhead wash behind the cursor spotlight. Default: true. */
  wash?: boolean;
  /** Clip the glow to the surface bounds. Turn off for surfaces that host
   *  fixed/absolute overflow (e.g. a header with a dropdown). Default: true. */
  overflowHidden?: boolean;
} & Omit<ComponentPropsWithoutRef<"div">, "className" | "children">;

/**
 * Ghost Light spotlight: a warm orange radial glow that follows the cursor
 * across a dark surface. Extracted from the landing hero so any dark section
 * (hero, header, dashboard, empty state) can share the same effect.
 *
 * The glow only reads on dark surfaces — pair it with `.stage-scene`/`dark`.
 */
export function SpotlightSurface({
  as: Tag = "div",
  children,
  className = "",
  flicker = false,
  wash = true,
  overflowHidden = true,
  ...rest
}: SpotlightSurfaceProps) {
  const spotRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const target = e.currentTarget;
    const { clientX, clientY } = e;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      spotRef.current?.style.setProperty("--spot-x", `${x}%`);
      spotRef.current?.style.setProperty("--spot-y", `${y}%`);
    });
  }, []);

  return (
    <Tag
      onPointerMove={handlePointerMove}
      className={`relative isolate ${overflowHidden ? "overflow-hidden" : ""} ${className}`}
      {...rest}
    >
      {wash && <div aria-hidden className="absolute inset-0 -z-10 stage-wash" />}
      <div
        aria-hidden
        ref={spotRef}
        className={`absolute inset-0 -z-10 stage-spotlight transition-opacity duration-500 ${flicker ? "animate-ghost-flicker" : ""}`}
      />
      {children}
    </Tag>
  );
}
