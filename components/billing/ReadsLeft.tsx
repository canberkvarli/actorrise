"use client";

import { useEffect, useState } from "react";
import { useUsageLimits } from "@/hooks/useSubscription";
import { GATE_COPY, readsLeftLine } from "@/lib/paywall/copy";
import { TrialOfferBanner, useTrialOffer } from "./TrialOffer";

/**
 * Says how many free reads are left, before the wall does.
 *
 * In September 2026, 87 actors read three or more pieces and 39 reached the
 * wall at five. The wall was the first any of them heard of a limit. This says
 * it while there is still something left to read.
 *
 * `ready` is the host's word that the piece on screen has loaded, which is
 * when the server has counted this read. Usage is cached for a minute, so it
 * is fetched again at that point and nothing is shown until the answer is in:
 * a count that is one read behind is a wrong count.
 */
export function ReadsLeft({ ready }: { ready: boolean }) {
  const { usage, mutate } = useUsageLimits();
  const [counted, setCounted] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let mounted = true;
    mutate()
      .catch(() => undefined)
      .then(() => {
        if (mounted) setCounted(true);
      });
    return () => {
      mounted = false;
    };
  }, [ready, mutate]);

  if (!counted || !usage) return null;
  const limit = usage.monologue_reads_limit ?? -1;
  if (limit < 0) return null; // unlimited
  const left = limit - (usage.monologue_reads_used ?? 0);
  if (left !== 1 && left !== 2) return null;

  // Mounted only once there is something true to say.
  return <ReadsLeftStrip left={left} />;
}

function ReadsLeftStrip({ left }: { left: number }) {
  const offer = useTrialOffer("reads_meter", true, GATE_COPY.reads_meter.variant);
  if (!offer.visible) return null;
  return (
    <TrialOfferBanner
      body={readsLeftLine(left)}
      href={offer.href}
      onAccept={offer.accept}
      onDismiss={offer.dismiss}
      // Only ever mounted on the monologue page, which has the Rehearse bar.
      aboveRunBar
    />
  );
}
