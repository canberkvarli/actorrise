"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useState, useEffect } from "react";

/** Dark text logo for light theme. Use TextLogo.png (black/dark text on transparent). */
const LOGO_LIGHT = "/TextLogo.png";
/** White text logo, transparent bg, for dark theme. */
const LOGO_DARK = "/transparentLogoText.png";

type Size = "header" | "auth";

const sizes: Record<Size, { width: number; height: number; className: string }> = {
  header: {
    width: 280,
    height: 64,
    className: "h-11 sm:h-10 md:h-12 lg:h-16 w-auto max-w-full object-contain",
  },
  auth: { width: 320, height: 80, className: "h-20 w-auto" },
};

export function BrandLogo({ size = "header" }: { size?: Size }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [darkFailed, setDarkFailed] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const src = isDark && !darkFailed ? LOGO_DARK : LOGO_LIGHT;
  const { width, height, className } = sizes[size];

  return (
    <Image
      src={src}
      alt="ActorRise"
      width={width}
      height={height}
      className={`${className} ${size === "header" ? "min-w-0" : "shrink-0"}`}
      priority
      onError={() => {
        if (isDark) setDarkFailed(true);
      }}
    />
  );
}
