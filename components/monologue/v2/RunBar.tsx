"use client";

import { IconPlayerPlay } from "@tabler/icons-react";

/**
 * The one thing you came here to do, on a phone.
 *
 * Desktop keeps Rehearse in the margin, where it sits beside what's true about
 * the piece. A phone has no margin, so the action comes to the foot of the
 * screen instead — and it is a bar rather than a floating pill because a pill
 * parked itself on top of whatever was last on the page.
 *
 * bottom-[88px] clears the 65px platform tab strip with air; lg:hidden because
 * from lg up the margin has it.
 */
export function RunBar({ onRehearse }: { onRehearse: () => void }) {
  return (
    <div
      className="t-m-barin fixed inset-x-0 bottom-[76px] z-40 px-3 pb-3 pt-2.5 lg:hidden"
      style={{
        background:
          "linear-gradient(to top, var(--page) 60%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-[560px] gap-2">
        <button
          type="button"
          onClick={onRehearse}
          className="inline-flex h-14 flex-1 items-center justify-between gap-3 rounded-full pl-5 pr-2 text-base font-bold shadow-[0_14px_40px_-12px_rgb(0_0_0/0.5)] transition-transform active:scale-[0.98]"
          style={{ background: "var(--t-cta-bg)", color: "var(--t-cta-fg)" }}
        >
          Rehearse this
          <span
            className="inline-flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              background: "var(--t-cta-dot-bg)",
              color: "var(--t-cta-dot-fg)",
            }}
          >
            <IconPlayerPlay className="h-4 w-4 fill-current" />
          </span>
        </button>
      </div>
    </div>
  );
}
