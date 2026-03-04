"use client";

import { Film, Globe, Instagram, Youtube, Star } from "lucide-react";
import { IconBrandX } from "@tabler/icons-react";

interface SocialLinkIconsProps {
  socialLinks: Record<string, string>;
  className?: string;
  iconSize?: string;
}

const PLATFORMS: {
  key: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  buildUrl: (value: string) => string;
}[] = [
  {
    key: "imdb",
    icon: Film,
    label: "IMDb",
    buildUrl: (v) => (v.startsWith("http") ? v : `https://www.imdb.com/name/${v}`),
  },
  {
    key: "website",
    icon: Globe,
    label: "Website",
    buildUrl: (v) => (v.startsWith("http") ? v : `https://${v}`),
  },
  {
    key: "instagram",
    icon: Instagram,
    label: "Instagram",
    buildUrl: (v) =>
      v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`,
  },
  {
    key: "x",
    icon: IconBrandX,
    label: "X / Twitter",
    buildUrl: (v) =>
      v.startsWith("http") ? v : `https://x.com/${v.replace(/^@/, "")}`,
  },
  {
    key: "youtube",
    icon: Youtube,
    label: "YouTube",
    buildUrl: (v) => (v.startsWith("http") ? v : `https://www.youtube.com/${v}`),
  },
  {
    key: "backstage",
    icon: Star,
    label: "Backstage",
    buildUrl: (v) =>
      v.startsWith("http") ? v : `https://www.backstage.com/u/${v}`,
  },
];

export function SocialLinkIcons({
  socialLinks,
  className = "",
  iconSize = "h-4 w-4",
}: SocialLinkIconsProps) {
  const entries = PLATFORMS.filter(
    (p) => socialLinks[p.key] && socialLinks[p.key].trim() !== "",
  );

  if (entries.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {entries.map((p) => {
        const Icon = p.icon;
        return (
          <a
            key={p.key}
            href={p.buildUrl(socialLinks[p.key])}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={p.label}
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon className={iconSize} />
          </a>
        );
      })}
    </div>
  );
}
