import { Skeleton } from "@/components/ui/skeleton";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * The scene preview's shape while it loads — ONE definition, used twice.
 *
 * This route had two skeletons: Next's `loading.tsx` for the navigation beat,
 * and the page's own for the SWR fetch that starts once the chunk has mounted.
 * Both are legitimate, and they ran back to back, so opening a scene showed a
 * skeleton, then a DIFFERENT skeleton, then the sides. They were written apart
 * and drifted apart: h-4 w-32 against h-4 w-28, a 120px block against a 96px
 * one, 320px against 256px. Every one of those differences was a visible jump
 * in a sequence that is supposed to read as one object resolving.
 *
 * Two states are fine; two SHAPES are not. Both callers render this, so the
 * handover is invisible by construction rather than by someone remembering to
 * keep two files in step.
 */
export function ScenePreviewSkeleton() {
  return (
    <div
      className={`theatre-monologue theatre-tokens t-m__body ${theatreFontVars} min-h-screen pb-32`}
    >
      <div className="mx-auto w-full max-w-[880px] px-5 pt-7 sm:px-6 sm:pt-10">
        <Skeleton className="h-4 w-32 opacity-40" />
        <Skeleton className="mt-7 h-3 w-28 opacity-40" />
        <Skeleton className="mt-3 h-11 w-2/3 opacity-40" />
        <Skeleton className="mt-3 h-3 w-1/2 opacity-40" />
        <Skeleton className="mt-7 h-[120px] w-full rounded-2xl opacity-40" />
        <Skeleton className="mt-7 h-[320px] w-full rounded-md opacity-40" />
      </div>
    </div>
  );
}
