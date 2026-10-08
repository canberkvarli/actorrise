/**
 * Under the empty page's capture box: a faint, blank ticket, the shape of what
 * the paste turns into. Decorative only; the box is the ask, this is the hint.
 */
export function GhostTicket() {
  const rows = ["the show", "the part", "when", "where"];
  return (
    <div aria-hidden="true" className="aud-ghost mt-14 w-full max-w-[440px] select-none md:mt-16">
      <div className="aud-ghost-ticket flex text-left">
        <div className="aud-ghost-stub flex w-[27%] shrink-0 flex-col items-center justify-center px-2 py-5">
          <span className="aud-title text-[56px] leading-[0.8]">?</span>
          <span className="aud-hero-dir mt-1.5 text-[13px]">no date yet</span>
        </div>
        <div className="min-w-0 flex-1 px-5 py-4">
          <div className="aud-ghost-head flex items-baseline justify-between gap-2 pb-1.5">
            <span className="aud-title text-[22px] leading-none">Coming up</span>
            <span className="aud-hero-dir text-[13px]">no. 1</span>
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {rows.map((r) => (
              <div key={r} className="grid grid-cols-[64px_minmax(0,1fr)] items-end gap-2">
                <span className="aud-hero-dir text-[14px] leading-tight">{r}</span>
                <span className="aud-ghost-line h-[17px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="aud-hero-dir mt-4 flex justify-between gap-2 px-1 text-[13px] sm:text-[14px]">
        <span>(three days out)</span>
        <span>(the night before)</span>
        <span>(the morning after)</span>
      </p>
    </div>
  );
}
