"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { BenchSkeleton } from "@/components/rehearse/BenchSkeleton";
import { useNextAudition } from "@/hooks/useAuditions";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * Where login sends people. With an audition in the next 14 days: its prep
 * room. Otherwise the Collection, exactly as before the tracker existed.
 *
 * No words while it decides. It used to say "Finding your next audition",
 * and since nearly everyone lands on the Collection, that sentence read as a
 * bug on the Collection. The bench skeleton is what arrives most of the time.
 */
export default function NextAuditionHop() {
  const router = useRouter();
  const { data, isError } = useNextAudition();
  useEffect(() => {
    if (isError) router.replace("/rehearse");
    else if (data) router.replace(data.audition ? `/auditions/${data.audition.id}?from=login` : "/rehearse");
  }, [data, isError, router]);
  return (
    <div role="status" aria-label="Loading" className={`theatre-tokens theatre-collection ${theatreFontVars}`}>
      <div className="relative isolate mx-auto w-full max-w-[1160px] px-5 py-8 sm:py-14 md:px-[14px]">
        <BenchSkeleton />
      </div>
    </div>
  );
}
