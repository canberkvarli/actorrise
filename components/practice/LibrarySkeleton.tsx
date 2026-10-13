import { Skeleton } from "@/components/ui/skeleton";

/** The /practice room while it loads, shaped like the library that arrives.
 *  Shared by the page and by practice/[id]/loading.tsx (a redirect into it). */
export function LibrarySkeleton() {
  return (
    <div aria-hidden className="grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-12">
      <div>
        <Skeleton className="h-4 w-56 opacity-40" />
        <Skeleton className="mt-4 h-24 w-full max-w-2xl opacity-40" />
        <Skeleton className="mt-10 h-4 w-24 opacity-40" />
        <Skeleton className="mt-3 h-6 w-80 max-w-full opacity-40" />
        <Skeleton className="mt-10 h-16 w-48 rounded-full opacity-40" />
      </div>
      <div>
        <Skeleton className="h-4 w-32 opacity-40" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-[14px] opacity-40" />
          ))}
        </div>
      </div>
    </div>
  );
}
