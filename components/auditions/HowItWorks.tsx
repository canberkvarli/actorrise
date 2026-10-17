"use client";

import { useSyncExternalStore } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { readIntroSeen, readLoopOpen, writeLoopOpen } from "@/lib/auditionIntro";
import { isPhoneViewport } from "@/lib/viewport";
import { IntroLoop } from "./IntroLoop";

/* The open/closed choice lives in localStorage; this is the store React reads
   it through. Toggling writes the flag and tells every reader. */
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
/* Closed by default on a phone once the intro has been seen (the loop was
   taking most of the screen); open by default on desktop. */
function getSnapshot(): boolean {
  return readLoopOpen(!(isPhoneViewport() && readIntroSeen()));
}
function getServerSnapshot(): boolean {
  return false;
}
function setLoopOpen(open: boolean) {
  writeLoopOpen(open);
  listeners.forEach((fn) => fn());
}

/**
 * The small looping demo under the paste box, behind a row that opens and
 * closes it. The choice is remembered in the browser.
 */
export function HowItWorks({ onExpand }: { onExpand: (step: number) => void }) {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div>
      <button
        type="button"
        onClick={() => setLoopOpen(!open)}
        aria-expanded={open}
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
