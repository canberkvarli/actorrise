"use client";

import { useEffect, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { useIsPhone } from "@/hooks/useIsPhone";
import { readIntroSeen, readLoopOpen, writeLoopOpen } from "@/lib/auditionIntro";
import { IntroLoop } from "./IntroLoop";

/**
 * The small looping demo under the paste box, behind a row that opens and
 * closes it. Closed by default on a phone once the intro has been seen (it
 * was taking most of the screen); open by default on desktop. The choice is
 * remembered in the browser.
 */
export function HowItWorks({ onExpand }: { onExpand: (step: number) => void }) {
  const isPhone = useIsPhone();
  // null until mounted: the default depends on the viewport and storage,
  // neither of which the server knows.
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    setOpen(readLoopOpen(!(isPhone && readIntroSeen())));
  }, [isPhone]);

  function toggle() {
    const next = !open;
    setOpen(next);
    writeLoopOpen(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open === true}
        aria-controls="aud-how-it-works"
        className="flex w-full items-center justify-between py-2 text-left"
      >
        <span className="aud-eyebrow">How it works</span>
        <IconChevronDown
          className="size-4 transition-transform duration-300"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>
      {open && (
        <div id="aud-how-it-works" className="mt-2">
          <IntroLoop onExpand={onExpand} />
        </div>
      )}
    </div>
  );
}
