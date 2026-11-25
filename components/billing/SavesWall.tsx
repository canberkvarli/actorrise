"use client";

import { useEffect, useState } from "react";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";

/** Raised when the server refuses a save (403 saves_plus). */
const SAVES_PLUS_EVENT = "saves-plus";

/**
 * For any save call's catch: true, and the wall opens, when the error is the
 * save cap; false for anything else, which the caller handles as before.
 */
export function openSavesWallIfCapped(err: unknown): boolean {
  const res = (err as { response?: { status?: number; data?: { detail?: { error?: string } } } })?.response;
  if (res?.status !== 403 || res.data?.detail?.error !== "saves_plus") return false;
  window.dispatchEvent(new Event(SAVES_PLUS_EVENT));
  return true;
}

/**
 * The wall at the save cap. A free account holds three saved monologues
 * (FREE_SAVES_LIMIT on the server, 3 since 2026-11-25); the next save opens this.
 *
 * Saves happen from a dozen places (cards, the slide-over, the piece page), so
 * rather than a modal beside every button the hook raises one window event and
 * this, mounted once in the platform layout, answers it.
 */
export function SavesWall() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onRefused = () => setOpen(true);
    window.addEventListener(SAVES_PLUS_EVENT, onRefused);
    return () => window.removeEventListener(SAVES_PLUS_EVENT, onRefused);
  }, []);

  return (
    <MonologuePaywallModal
      open={open}
      onOpenChange={setOpen}
      feature="saves"
      lead="read"
      title="Your book is full on the free plan."
      description="Plus keeps every piece you find, and opens every one start to finish."
    />
  );
}
