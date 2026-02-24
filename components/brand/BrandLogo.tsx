"use client";

import Image from "next/image";

/** Icon-only logo (e.g. favicon, auth). Use transparent_logo.png for icon-only. */
const LOGO_ICON = "/transparent_logo.png";
/** Full logo with "ActorRise" wordmark (use version with header-matching bg for blend). */
const LOGO_WITH_TEXT = "/logo_text.png";

type Size = "header" | "auth";

/* Icon: square (e.g. 273×273). Same asset used for auth and for other platforms (social, etc.). */
const LOGO_ICON_ASPECT = { w: 273, h: 273 };
const LOGO_TEXT_ASPECT = { w: 320, h: 80 };

const sizes: Record<Size, { iconClass: string; fullLogoClass: string }> = {
  header: {
    iconClass: "h-10 sm:h-11 md:h-12 lg:h-14 w-auto shrink-0 object-contain",
    fullLogoClass: "h-10 sm:h-11 md:h-12 lg:h-14 w-auto shrink-0 object-contain",
  },
  auth: {
    iconClass: "h-[5.5rem] sm:h-[6rem] w-auto shrink-0 object-contain",
    fullLogoClass: "h-[5.5rem] sm:h-[6rem] w-auto shrink-0 object-contain",
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
