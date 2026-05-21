"use client";

import { useAuth } from "@/lib/auth";
import { useMyFoundingActor } from "@/hooks/useFoundingActors";
import { FoundingActorEditForm } from "@/components/founding-actor/FoundingActorEditForm";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { IconExternalLink } from "@tabler/icons-react";

export default function FoundingActorEditPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: actor, isLoading: actorLoading } = useMyFoundingActor();
  const router = useRouter();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // If user is loaded and not a founding actor, redirect
    if (!user.is_founding_actor) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  if (authLoading || actorLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-5 w-96 mb-8" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!user?.is_founding_actor || !actor) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground font-brand">
            My Founding Actor Page
          </h1>
          <Link
            href={`/actors/${actor.slug}`}
            target="_blank"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View public page
            <IconExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="text-muted-foreground mt-1">
          Edit your bio, headshots, and social links. Changes go live immediately.
        </p>
      </div>

      <FoundingActorEditForm actor={actor} />
    </div>
  );
}
