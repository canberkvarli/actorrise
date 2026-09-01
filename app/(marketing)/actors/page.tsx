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
            The founding <em className="italic text-primary">actors</em>
          </>
        }
        lede={
          <>
            The actors who backed ActorRise from day one. They shape the
            platform, tell me what&apos;s broken, and help build something that
            actually serves the craft.
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
            No actors to display yet.
          </p>
        )}

        {/* The founding-actor title belongs to these five, who were here from
            the beginning. The programme itself closed on 2026-08-29, so this
            no longer invites people to be considered for it. The open door
            stays: a real conversation, not a form. */}
        <div className="mt-14 border-t border-border/60 pt-10 text-center">
          <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
            Using ActorRise and want to tell me what&apos;s broken, or what you
            wish it did? Send me an email. I read every one, and it is how most
            of this got built.
          </p>
          <a
            href="mailto:canberk@actorrise.com?subject=ActorRise"
            className="mt-4 inline-block text-base font-medium text-primary underline underline-offset-4"
          >
            canberk@actorrise.com
          </a>
        </div>
        </div>
      </div>
    </>
  );
}
