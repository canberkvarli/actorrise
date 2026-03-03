"use client";

import Image from "next/image";
import Link from "next/link";
import { SocialLinkIcons } from "./SocialLinkIcons";

interface Headshot {
  url: string;
  is_primary?: boolean;
  caption?: string;
}

interface FoundingActorCardProps {
  name: string;
  slug: string;
  descriptor?: string;
  quote?: string;
  headshots: Headshot[];
  socialLinks: Record<string, string>;
}

export function FoundingActorCard({
  name,
  slug,
  descriptor,
  quote,
  headshots,
  socialLinks,
}: FoundingActorCardProps) {
  const primaryHeadshot =
    headshots.find((h) => h.is_primary) || headshots[0];

  return (
    <Link
      href={`/actors/${slug}`}
      className="group block rounded-2xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Headshot */}
      {primaryHeadshot ? (
        <div className="relative w-full aspect-[4/5] bg-muted">
          <Image
            src={primaryHeadshot.url}
            alt={`${name} headshot`}
            fill
            className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        </div>
      ) : (
        <div className="w-full aspect-[4/5] bg-muted flex items-center justify-center text-muted-foreground">
          <span className="text-4xl font-semibold">
            {name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()}
          </span>
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-5">
        <h3 className="font-semibold text-foreground text-base sm:text-lg group-hover:text-primary transition-colors">
          {name}
        </h3>
        {descriptor && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {descriptor}
          </p>
        )}
        {quote && (
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            &ldquo;{quote}&rdquo;
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <SocialLinkIcons socialLinks={socialLinks} />
          <span className="text-xs text-primary font-medium group-hover:underline">
            Learn more &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
