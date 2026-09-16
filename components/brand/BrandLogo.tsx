"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/** Icon-only logo (e.g. favicon, auth). Use transparent_logo.png for icon-only. */
const LOGO_ICON = "/transparent_logo.png";
/** Full logo with "ActorRise" wordmark -- white text for dark bg. */
const LOGO_WITH_TEXT = "/transparent_textlogo.png";
/** Full logo with "ActorRise" wordmark -- dark text for light bg. */
const LOGO_WITH_TEXT_DARK = "/transparent_textlogo_dark.png";

type Size = "header" | "auth";

/* The files' TRUE intrinsic sizes, which is the only thing these numbers are
   for: every wordmark here is rendered at a fixed height with `w-auto`, so the
   browser reserves width from this ratio and then reflows to the real one the
   moment the PNG decodes.

   transparent_textlogo.png is 2000x600 (3.333), and it was declared 320x80
   (4.0) here, 140x34 (4.12) in the landing nav and 150x36 (4.17) in both
   footers and the auth shell. Nobody had measured it. At the landing nav's
   34px height that is 140px reserved for a 113px image: the pill lays out
   27px too wide, then snaps narrower a second later and drags every item in
   it sideways. That is the flicker on the header — the elements really are
   finding their position, because the first position was wrong. */
const LOGO_ICON_ASPECT = { w: 200, h: 200 };
const LOGO_TEXT_ASPECT = { w: 2000, h: 600 };

/* Larger logo, mobile-friendly: prominent on small screens so header isn't just "dropdown on the left". */
const sizes: Record<Size, { iconClass: string; fullLogoClass: string }> = {
  header: {
    iconClass: "h-11 sm:h-12 md:h-14 w-auto max-w-full min-h-10 shrink-0 object-contain",
    fullLogoClass: "h-11 sm:h-12 md:h-14 w-auto max-w-[200px] sm:max-w-[220px] md:max-w-none min-h-10 shrink-0 object-contain",
  },
  auth: {
    iconClass: "h-[5.5rem] sm:h-[6rem] w-auto max-w-full shrink-0 object-contain",
    fullLogoClass: "h-[5.5rem] sm:h-[6rem] w-auto max-w-full shrink-0 object-contain",
  },
};

export function BrandLogo({
  size = "header",
  iconOnly = false,
  onDark = false,
}: {
  size?: Size;
  iconOnly?: boolean;
  /** Force the white-text wordmark for surfaces that are always dark (e.g. the stage header). */
  onDark?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { iconClass, fullLogoClass } = sizes[size];

  if (iconOnly) {
    return (
      <Image
        src={LOGO_ICON}
        alt="ActorRise"
        width={LOGO_ICON_ASPECT.w}
        height={LOGO_ICON_ASPECT.h}
        className={iconClass}
        priority
        unoptimized
      />
    );
  }

  const logoSrc =
    !onDark && mounted && resolvedTheme === "light" ? LOGO_WITH_TEXT_DARK : LOGO_WITH_TEXT;

  return (
    <Image
      src={logoSrc}
      alt="ActorRise"
      width={LOGO_TEXT_ASPECT.w}
      height={LOGO_TEXT_ASPECT.h}
      className={fullLogoClass}
      priority
    />
  );
}
