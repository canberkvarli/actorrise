"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ComponentProps } from "react";

/**
 * The playbill sketches: hand-drawn line icons for famous plays and stage
 * archetypes. All strokes use currentColor so they sit on any surface —
 * landing accents today, empty states / cards / filters across the app later.
 * Each one draws itself in when scrolled into view (Apple-keynote style).
 */

type SketchProps = {
  size?: number;
  className?: string;
  /** seconds before the drawing starts once in view */
  delay?: number;
  title?: string;
};

function useSketchAnimation(delay: number) {
  const reduce = useReducedMotion();
  return (order: number): Partial<ComponentProps<typeof motion.path>> =>
    reduce
      ? {}
      : {
          initial: { pathLength: 0, opacity: 0 },
          whileInView: { pathLength: 1, opacity: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: {
            pathLength: { duration: 0.9, ease: "easeInOut", delay: delay + order * 0.18 },
            opacity: { duration: 0.01, delay: delay + order * 0.18 },
          },
        };
}

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Frame({
  size,
  className,
  title,
  viewBox,
  children,
}: SketchProps & { viewBox: string; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {children}
    </svg>
  );
}

/** Yorick — Hamlet. The one everybody brings. */
export function SkullSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M32 6 C17 6 10 17 10 28 C10 36 14 41 18 44 L18 52 C18 55 20 57 23 57 L41 57 C44 57 46 55 46 52 L46 44 C50 41 54 36 54 28 C54 17 47 6 32 6 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M20 28 C20 24 23 22 26 22 C29 22 31 25 30 29 C29 32 26 33 24 33 C21 33 20 31 20 28 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M44 28 C44 24 41 22 38 22 C35 22 33 25 34 29 C35 32 38 33 40 33 C43 33 44 31 44 28 Z"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M32 36 L29 42 L35 42 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M26 50 L26 56 M32 50 L32 56 M38 50 L38 56" />
    </Frame>
  );
}

/** Comedy and tragedy — the trade itself. */
export function MasksSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M8 12 C16 10 24 10 32 12 L32 34 C32 44 26 50 20 50 C14 50 8 44 8 34 Z"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M14 24 C15 22 17 22 18 24 M24 24 C25 22 27 22 28 24" />
      <motion.path {...strokeProps} {...draw(1)} d="M14 34 C17 39 23 39 26 34" />
      <motion.path
        {...strokeProps}
        {...draw(2)}
        d="M32 16 C40 14 48 14 56 16 L56 38 C56 48 50 54 44 54 C38 54 32 48 32 38 Z"
      />
      <motion.path {...strokeProps} {...draw(3)} d="M38 28 C39 26 41 26 42 28 M48 28 C49 26 51 26 52 28" />
      <motion.path {...strokeProps} {...draw(3)} d="M38 44 C41 39 47 39 50 44" />
    </Frame>
  );
}

/** Is this a dagger which I see before me — Macbeth. */
export function DaggerSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M32 4 C36 12 36 26 32 38 C28 26 28 12 32 4 Z" />
      <motion.path {...strokeProps} {...draw(1)} d="M22 40 L42 40" />
      <motion.path {...strokeProps} {...draw(2)} d="M32 40 L32 52 M28 56 C30 53 34 53 36 56" />
      <motion.path {...strokeProps} {...draw(3)} d="M14 16 L18 20 M50 16 L46 20 M12 30 L17 31 M52 30 L47 31" />
    </Frame>
  );
}

/** A rose by any other name — Romeo & Juliet. */
export function RoseSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M32 22 C30 18 33 15 36 16 C40 17 40 22 36 25 C31 28 25 25 26 19 C27 12 36 9 42 14 C48 19 46 28 38 31 C29 34 20 28 22 18"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M32 32 C32 40 32 48 32 58" />
      <motion.path {...strokeProps} {...draw(2)} d="M32 42 C27 40 23 41 20 38 C25 36 30 38 32 42 Z" />
      <motion.path {...strokeProps} {...draw(3)} d="M32 50 C37 48 41 49 44 46 C39 44 34 46 32 50 Z" />
    </Frame>
  );
}

/** Uneasy lies the head — Lear, the histories, every king. */
export function CrownSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M12 46 L9 22 L21 32 L32 16 L43 32 L55 22 L52 46 Z"
      />
      <motion.path {...strokeProps} {...draw(1)} d="M12 52 L52 52" />
      <motion.path {...strokeProps} {...draw(2)} d="M9 19 A1.8 1.8 0 1 1 9 15.4 A1.8 1.8 0 1 1 9 19 M32 13 A1.8 1.8 0 1 1 32 9.4 A1.8 1.8 0 1 1 32 13 M55 19 A1.8 1.8 0 1 1 55 15.4 A1.8 1.8 0 1 1 55 19" />
    </Frame>
  );
}

/** The Fool, Feste, the joker — the one who tells the truth. */
export function JesterSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path
        {...strokeProps}
        {...draw(0)}
        d="M14 44 C12 30 18 20 32 20 C46 20 52 30 50 44 Z"
      />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M16 28 C10 22 8 14 12 8 C18 10 22 16 22 23 M48 28 C54 22 56 14 52 8 C46 10 42 16 42 23 M32 20 C30 14 30 8 32 4"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M11 10 A2 2 0 1 1 11 6 A2 2 0 1 1 11 10 M53 10 A2 2 0 1 1 53 6 A2 2 0 1 1 53 10 M32 6 A2 2 0 1 1 32 2 A2 2 0 1 1 32 6" />
      <motion.path {...strokeProps} {...draw(3)} d="M14 50 L50 50 M18 56 L46 56" />
    </Frame>
  );
}

/** The stage door, ajar, light spilling through. Walk in off book. */
export function StageDoorSketch({ size = 48, className, delay = 0, title }: SketchProps) {
  const draw = useSketchAnimation(delay);
  return (
    <Frame size={size} className={className} title={title} viewBox="0 0 64 64">
      <motion.path {...strokeProps} {...draw(0)} d="M16 58 L16 8 L48 8 L48 58" />
      <motion.path {...strokeProps} {...draw(1)} d="M22 58 L22 14 L40 20 L40 58" />
      <motion.path {...strokeProps} {...draw(2)} d="M36 38 A1.6 1.6 0 1 1 36 34.8" />
      <motion.path {...strokeProps} {...draw(3)} d="M44 24 L54 20 M44 32 L56 30 M44 40 L54 42" />
    </Frame>
  );
}

/** Curtain swag with tassels — the scene ends, another begins. */
export function CurtainSketch({
  width = 220,
  height = 44,
  className,
  delay = 0,
  title,
}: Omit<SketchProps, "size"> & { width?: number; height?: number }) {
  const draw = useSketchAnimation(delay);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 220 44"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      <motion.path {...strokeProps} {...draw(0)} d="M2 4 L218 4" />
      <motion.path
        {...strokeProps}
        {...draw(1)}
        d="M2 4 C30 22 50 22 74 12 C94 24 126 24 146 12 C170 22 190 22 218 4"
      />
      <motion.path {...strokeProps} {...draw(2)} d="M74 12 L74 26 M76 30 A2.4 2.4 0 1 1 71.4 30 A2.4 2.4 0 1 1 76 30 M146 12 L146 26 M148.3 30 A2.4 2.4 0 1 1 143.7 30 A2.4 2.4 0 1 1 148.3 30" />
    </svg>
  );
}
