"use client";

import Image from "next/image";

/** Brand icon, trimmed (no empty padding). Generated: magick public/logo.png -trim +repage public/logo-trimmed.png */
const LOGO_ICON = "/logo-trimmed.png";

type Size = "header" | "auth";

/* Trimmed logo aspect ~744×1340 (tall). Sizing by height, width auto. */
const LOGO_ASPECT = { w: 744, h: 1340 };

const sizes: Record<Size, { iconClass: string; textClass: string }> = {
  header: {
    iconClass: "h-10 sm:h-11 md:h-12 lg:h-14 w-auto shrink-0 object-contain",
    textClass: "text-xl sm:text-2xl md:text-3xl lg:text-4xl",
  },
  auth: {
    iconClass: "h-[5.5rem] sm:h-[6rem] w-auto shrink-0 object-contain",
    textClass: "text-3xl sm:text-4xl",
  },
};

export function BrandLogo({
  size = "header",
  iconOnly = false,
}: {
  size?: Size;
  iconOnly?: boolean;
}) {
  const { iconClass, textClass } = sizes[size];

  return (
    <span className="inline-flex items-center gap-2.5 min-w-0 shrink">
      <Image
        src={LOGO_ICON}
        alt={iconOnly ? "ActorRise" : ""}
        width={LOGO_ASPECT.w}
        height={LOGO_ASPECT.h}
        className={iconClass}
        priority
      />
      {!iconOnly && (
        <span
          className={`font-brand font-semibold text-foreground tracking-tight truncate ${textClass}`}
        >
          ActorRise
        </span>
      )}
    </span>
  );
}
