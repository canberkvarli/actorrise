"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useFoundingActor } from "@/hooks/useFoundingActors";
import { HeadshotGallery } from "@/components/founding-actor/HeadshotGallery";
import { SocialLinkIcons } from "@/components/founding-actor/SocialLinkIcons";
import { Skeleton } from "@/components/ui/skeleton";

export default function FoundingActorPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { data: actor, isLoading } = useFoundingActor(slug);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-5xl">
        <Skeleton className="h-6 w-48 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          <Skeleton className="aspect-[4/5] rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="container mx-auto px-4 sm:px-6 py-16 md:py-24 max-w-3xl text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">
          Actor not found
        </h1>
        <p className="text-muted-foreground mb-6">
          This founding actor page doesn&apos;t exist or is not published yet.
        </p>
        <Link
          href="/actors"
          className="text-primary hover:underline font-medium"
        >
          &larr; Back to all founding actors
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 py-12 md:py-20 max-w-5xl">
      {/* Back link */}
      <Link
        href="/actors"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        All founding actors
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-8 md:gap-12">
        {/* Headshots */}
        <HeadshotGallery
          headshots={actor.headshots}
          name={actor.name}
        />

        {/* Content */}
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground font-brand">
            {actor.name}
          </h1>
          {actor.descriptor && (
            <p className="mt-1 text-muted-foreground text-base md:text-lg">
              {actor.descriptor}
            </p>
          )}

          {/* Social links */}
          <SocialLinkIcons
            socialLinks={actor.social_links}
            className="mt-3"
            iconSize="h-5 w-5"
          />

          {/* Bio */}
          {actor.bio && (
            <div className="mt-6 prose prose-neutral dark:prose-invert max-w-none">
              <p className="text-foreground/90 leading-relaxed whitespace-pre-line">
                {actor.bio}
              </p>
            </div>
          )}

          {/* Testimonial quote */}
          {actor.quote && (
            <div className="mt-8 relative rounded-xl border border-border/60 bg-card p-6 sm:p-8">
              <span
                className="absolute top-3 left-4 text-4xl font-serif text-muted-foreground/30 leading-none select-none pointer-events-none"
                aria-hidden
              >
                &ldquo;
              </span>
              <p className="pl-6 text-sm sm:text-base text-foreground leading-relaxed font-medium">
                {actor.quote}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
