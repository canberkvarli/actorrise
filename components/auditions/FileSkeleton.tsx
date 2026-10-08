/**
 * The shape of an audition's page while the list loads: the same columns and
 * rhythm as AuditionFile, in faint paper blocks, so the real page lands in
 * place instead of replacing a line of text. It waits 400ms before showing at
 * all, so a quick load goes straight from nothing to the page.
 */
function Bar({ w, h = 12, className = "" }: { w: string; h?: number; className?: string }) {
  return <span className={`aud-ghost-bar block ${className}`} style={{ width: w, height: h }} />;
}

export function FileSkeleton() {
  return (
    <div className="aud-skeleton grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_280px]" role="status" aria-label="Loading your auditions">
      <div className="min-w-0">
        <Bar w="150px" h={10} />
        <Bar w="min(520px, 85%)" h={64} className="mt-4" />
        <Bar w="120px" h={16} className="mt-5" />
        <Bar w="min(340px, 70%)" h={16} className="mt-3" />
        <Bar w="170px" h={48} className="mt-8 !rounded-full" />
        {[0, 1].map((i) => (
          <div key={i} className="mt-12">
            <Bar w="150px" h={22} />
            <span className="aud-ghost-rule mt-3 block" />
            <Bar w="100%" h={110} className="mt-4" />
          </div>
        ))}
      </div>
      <div className="min-w-0 max-lg:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="mt-5 first:mt-1">
            <Bar w="60px" h={9} />
            <Bar w={i % 2 ? "150px" : "190px"} h={14} className="mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
