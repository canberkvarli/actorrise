"use client";

import { Suspense } from "react";

import { BenchSkeleton } from "@/components/rehearse/BenchSkeleton";
import { RehearseHub } from "@/components/rehearse/RehearseHub";
import { theatreFontVars } from "@/lib/fonts/theatre";


/**
 * /rehearse — the Collection: monologues the actor is studying.
 *
 * Two rooms. The piece on the bench sits on a lit ink panel; everything else
 * the actor owns sits below it in the house, on paper. `.theatre-collection`
 * carries the palette and the three faces, scoped here so no other route
 * loads the fonts or sees the tokens.
 */
export default function RehearsePage() {
  return (
    <div className={`theatre-tokens theatre-collection ${theatreFontVars}`}>
      <div className="relative isolate mx-auto w-full max-w-[1160px] px-5 py-8 sm:py-14 md:px-[14px]">
        <Suspense fallback={<BenchSkeleton />}>
          <RehearseHub />
        </Suspense>
      </div>
    </div>
  );
}
