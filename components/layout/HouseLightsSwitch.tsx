"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

/**
 * The house lights, as a switch rather than an icon button.
 *
 * Its own component rather than a restyle of `ThemeToggle`, which is shared
 * with the marketing header and the settings page — this shape only belongs in
 * the platform bar, and changing the shared one would drag it everywhere.
 *
 * The knob carries a stage lamp on a stand, and it sits on the gel when the
 * lights are up. Dark is the switch thrown down: a dim knob on a dim track,
 * because blackout is the state where nothing in the room is lit.
 */
const NEVER_CHANGES = () => () => {};

/** Shared by the bar switch and the phone sheet's row: which way the lights
 *  are, what to call the other state, and how to throw them. */
function useHouseLights() {
  const { setTheme, resolvedTheme } = useTheme();
  /* Hydration guard without a setState in an effect: false on the server,
     true once the client has taken over. Before that the switch renders in its
     lights-up position, which is the server's assumption anyway. */
  const mounted = useSyncExternalStore(NEVER_CHANGES, () => true, () => false);

  const dark = mounted && resolvedTheme === "dark";

  return {
    dark,
    label: dark ? "House lights up" : "Blackout",
    toggle: () => {
      const next = dark ? "light" : "dark";
      /* The same view-transition wipe the shared toggle uses, where the
         browser supports it. */
      if (typeof document !== "undefined" && document.startViewTransition) {
        document.startViewTransition(() => setTheme(next));
      } else {
        setTheme(next);
      }
    },
  };
}

const LAMP_PATH = "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z";

export function HouseLightsSwitch() {
  const { dark, label, toggle } = useHouseLights();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={label}
      title={label}
      className="t-lights"
      data-dark={dark}
    >
      <span aria-hidden className="t-lights__knob">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={LAMP_PATH} />
        </svg>
      </span>
    </button>
  );
}

/**
 * The same switch as a row in the phone sheet.
 *
 * The 58px track belongs in the bar, where it sits among other ink-glass
 * controls. In the sheet — cream paper, 44px rows, everything else a plain
 * labelled line — it would be the one object shouting, so here the lights are
 * a row that says which way it is about to throw them.
 */
export function HouseLightsRow({ onToggle }: { onToggle?: () => void }) {
  const { dark, label, toggle } = useHouseLights();

  return (
    <button
      type="button"
      className="t-sheet__row"
      aria-pressed={dark}
      onClick={() => {
        toggle();
        onToggle?.();
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={LAMP_PATH} />
      </svg>
      {label}
    </button>
  );
}
