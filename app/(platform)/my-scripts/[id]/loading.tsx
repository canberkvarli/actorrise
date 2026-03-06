import { Skeleton } from "@/components/ui/skeleton";

export default function ScriptDetailLoading() {
  return (
    <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6 max-w-6xl">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Script info card */}
        <div className="rounded-xl border bg-card p-5 sm:p-6 space-y-4">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="pt-2 border-t space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="pt-2 border-t space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>

        {/* Right: Scenes */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-64" />
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-20" />
              </div>
              <div className="flex gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-14" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
