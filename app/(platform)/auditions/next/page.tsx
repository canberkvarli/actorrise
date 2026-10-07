"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useNextAudition } from "@/hooks/useAuditions";

/**
 * Where login sends people. With an audition in the next 14 days: its prep
 * room. Otherwise the Collection, exactly as before the tracker existed.
 */
export default function NextAuditionHop() {
  const router = useRouter();
  const { data, isError } = useNextAudition();
  useEffect(() => {
    if (isError) router.replace("/rehearse");
    else if (data) router.replace(data.audition ? `/auditions/${data.audition.id}?from=login` : "/rehearse");
  }, [data, isError, router]);
  return (
    <p role="status" className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted-foreground">
      Finding your next audition
    </p>
  );
}
