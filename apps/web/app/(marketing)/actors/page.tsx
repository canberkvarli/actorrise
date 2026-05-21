"use client";

import { useFoundingActors } from "@/hooks/useFoundingActors";
import { FoundingActorCard } from "@/components/founding-actor/FoundingActorCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActorsPage() {
  const { data: actors, isLoading } = useFoundingActors();

  return (
    <div className="container mx-auto px-4 sm:px-6 py-16 md:py-24">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground font-brand">
            Meet Our Founding Actors
          </h1>
          <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
            The actors who believed in ActorRise from day one. They shape the
            platform, provide feedback, and help us build something that truly
            serves the craft.
          </p>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/60 overflow-hidden">
                <Skeleton className="w-full aspect-[4/5]" />
                <div className="p-5 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-12 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : actors && actors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {actors.map((actor) => (
              <FoundingActorCard
                key={actor.id}
                name={actor.name}
                slug={actor.slug}
                descriptor={actor.descriptor}
                quote={actor.quote}
                headshots={actor.headshots}
                socialLinks={actor.social_links}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">
            No founding actors to display yet.
          </p>
        )}
      </div>
    </div>
  );
}
