"use client";

import Image from "next/image";

/** Icon-only logo (e.g. favicon, auth). Use transparent_logo.png for icon-only. */
const LOGO_ICON = "/transparent_logo.png";
/** Full logo with "ActorRise" wordmark for web (transparent bg, blends with theme). */
const LOGO_WITH_TEXT = "/transparent_textlogo.png";

type Size = "header" | "auth";

/* Icon: square (e.g. 273×273). Same asset used for auth and for other platforms (social, etc.). */
const LOGO_ICON_ASPECT = { w: 273, h: 273 };
const LOGO_TEXT_ASPECT = { w: 320, h: 80 };

/* Larger logo, mobile-friendly: prominent on small screens so header isn’t just “dropdown on the left”. */
const sizes: Record<Size, { iconClass: string; fullLogoClass: string }> = {
  header: {
    iconClass: "h-9 sm:h-10 md:h-11 w-auto max-w-full min-h-8 shrink-0 object-contain",
    fullLogoClass: "h-9 sm:h-10 md:h-11 w-auto max-w-[160px] sm:max-w-[180px] md:max-w-none min-h-8 shrink-0 object-contain",
  },
  auth: {
    iconClass: "h-[5.5rem] sm:h-[6rem] w-auto max-w-full shrink-0 object-contain",
    fullLogoClass: "h-[5.5rem] sm:h-[6rem] w-auto max-w-full shrink-0 object-contain",
  },
};

export function BrandLogo({
  size = "header",
  iconOnly = false,
}: {
  size?: Size;
  iconOnly?: boolean;
}) {
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

  return (
    <Image
      src={LOGO_WITH_TEXT}
      alt="ActorRise"
      width={LOGO_TEXT_ASPECT.w}
      height={LOGO_TEXT_ASPECT.h}
      className={fullLogoClass}
      priority
    />
  );
}
