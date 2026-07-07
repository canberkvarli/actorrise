"use client";

import { useFoundingActors } from "@/hooks/useFoundingActors";
import { FoundingActorCard } from "@/components/founding-actor/FoundingActorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { StageHero } from "@/components/marketing/StageHero";

export default function ActorsPage() {
  const { data: actors, isLoading } = useFoundingActors();

  return (
    <>
      <StageHero
        direction="(the company.)"
        title={
          <>
            Meet the <em className="italic text-primary">founding</em> actors
          </>
        }
        lede={
          <>
            The actors who believed in ActorRise from day one. They shape the
            platform, provide feedback, and help build something that truly
            serves the craft.
          </>
        }
      />
      <div className="container mx-auto px-4 sm:px-6 py-12 md:py-16">
        <div className="max-w-5xl mx-auto">
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
    </>
  );
}
