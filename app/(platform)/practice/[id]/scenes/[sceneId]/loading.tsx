import { Skeleton } from "@/components/ui/skeleton";
import { theatreFontVars } from "@/lib/fonts/theatre";

/**
 * The preview's shape, held while its chunk loads.
 *
 * Shaped like what is coming, not a spinner: the acts list dims and hands over
 * to this, and this hands over to the real sides, so opening a scene is one
 * move rather than three states with nothing in common.
 */
export default function Loading() {
  return (
    <div className={`theatre-monologue theatre-tokens t-m__body ${theatreFontVars} min-h-screen pb-32`}>
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
