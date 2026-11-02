"use client";

import { useState } from "react";
import { MonologuePaywallModal } from "@/components/monologue-work/MonologuePaywallModal";
import { useTrialWords } from "@/hooks/useTrialWords";
import { useT } from "@/lib/i18n";

const KEY = (id: number | string) => `arc.readModal.${id}`;

/** True the first time a piece is opened in this tab, false after. Decided
 *  once, in the state initializer: the server has no sessionStorage and
 *  answers false, and Radix mounts the dialog's portal only after hydration,
 *  so the two first renders agree on the DOM. */
function firstTimeThisSession(id: number | string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(KEY(id)) === "1") return false;
    sessionStorage.setItem(KEY(id), "1");
  } catch {
    /* private mode: show it anyway, once per mount */
  }
  return true;
}

/**
 * Pops once per piece per session when the free reads are spent, over the
 * inline wall, so the trial is one tap away instead of a scroll to the
 * bottom of the fragment. Dismissing leaves the wall where it is; the page
 * still says why the text stops. No number in the copy: the cap has moved
 * once already. The CTA names the trial length from the server.
 */
export function ReadWallModal({ monologueId }: { monologueId: number | string }) {
  const [open, setOpen] = useState(() => firstTimeThisSession(monologueId));
  const words = useTrialWords();
  const t = useT();

  return (
    <MonologuePaywallModal
      open={open}
      onOpenChange={setOpen}
      feature="monologue_read_modal"
      dir={t("appMonologueWall.direction")}
      lead="read"
      title={words.tasted ? words.overTitle : t("appMonologueWall.title")}
      description={
        words.tasted
          ? words.overBody
          : t("appMonologueWall.body")
      }
      quietLabel={t("appMonologueWall.notNow")}
    />
  );
}
