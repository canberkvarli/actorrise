import { LibrarySkeleton } from "@/components/practice/LibrarySkeleton";

/* /practice/[id] only redirects to /practice?script=<id>, so what arrives is
   the library. This used to draw the retired script-detail page, which showed
   for a beat and was then replaced by the library's own skeleton. */
export default function ScriptDetailLoading() {
  return (
    <div className="container relative mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-6 sm:pb-24 sm:pt-14 lg:px-8">
      <LibrarySkeleton />
    </div>
  );
}
