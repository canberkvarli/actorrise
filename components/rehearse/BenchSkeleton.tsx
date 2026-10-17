import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the bench, because that is what arrives. */
export function BenchSkeleton() {
  return (
    <div className="t-bench">
      <div className="t-bench__grid">
        <Skeleton className="aspect-[2/3] w-[132px] shrink-0 rounded-sm bg-white/10 sm:w-[180px]" />
        <div className="w-full space-y-4">
          <Skeleton className="h-4 w-28 bg-white/10" />
          <Skeleton className="h-11 w-2/3 bg-white/10" />
          <Skeleton className="h-4 w-1/2 bg-white/10" />
          <Skeleton className="h-24 w-full max-w-prose bg-white/10" />
          <Skeleton className="h-[60px] w-44 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}
