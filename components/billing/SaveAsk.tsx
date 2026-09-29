"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useBookmarkCount } from "@/hooks/useBookmarks";
import { GATE_COPY } from "@/lib/paywall/copy";
import { TrialOfferBanner, useTrialOffer } from "./TrialOffer";

/** The saves that read as a book taking shape. */
const SAVES_WORTH_ASKING_AT = [3, 4];

/**
 * The ask after a third save.
 *
 * Saving is free and stays free: it is what every return email is anchored on,
 * and 82 free actors already held four or more pieces when this was written.
 * So this blocks nothing. It speaks once, at the moment an actor has put three
 * pieces together, which 75 of them did in the 30 days to 2026-09-29 without
 * ever being shown a price.
 *
 * Mounted once, in the platform layout. It watches the saved count the header
 * already fetches and fires only on a count that went UP while the page was
 * open: arriving with three pieces saved is not the same as saving a third.
 */
export function SaveAsk() {
  const { count, isLoading } = useBookmarkCount();
  const pathname = usePathname();
  const previous = useRef<number | null>(null);
  // Where the save happened. The ask belongs to that page and leaves with it.
  const [askedOn, setAskedOn] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const before = previous.current;
    previous.current = count;
    // null is the first load, not a save.
    if (before === null || count <= before) return;
    if (SAVES_WORTH_ASKING_AT.includes(count)) setAskedOn(pathname);
    // pathname is read, not watched: a route change is not a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, isLoading]);

  if (askedOn === null || askedOn !== pathname) return null;
  // Mounted at the moment of the save, so the limiter it reads is current
  // rather than whatever it was when the app loaded.
  return <SaveAskStrip aboveRunBar={MONOLOGUE_PAGE.test(pathname)} />;
}

/** /monologue/812, the page with the Rehearse bar. Not /monologue/812/work. */
const MONOLOGUE_PAGE = /^\/monologue\/\d+\/?$/;

function SaveAskStrip({ aboveRunBar }: { aboveRunBar: boolean }) {
  const copy = GATE_COPY.third_save;
  const offer = useTrialOffer("third_save", true, copy.variant);
  if (!offer.visible) return null;
  return (
    <TrialOfferBanner
      body={`${copy.headline} ${copy.body}`}
      href={offer.href}
      onAccept={offer.accept}
      onDismiss={offer.dismiss}
      aboveRunBar={aboveRunBar}
    />
  );
}
