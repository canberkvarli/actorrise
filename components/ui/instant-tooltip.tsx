"use client";

/**
 * A tooltip that appears the moment you hover.
 *
 * The icon buttons used the native `title` attribute, which the browser holds
 * back for roughly a second before showing anything — long enough that a row
 * of unlabelled icons reads as unlabelled. You hover, nothing happens, you
 * move on. Native `title` also cannot be styled and never fires on keyboard
 * focus, so the labels were invisible to anyone tabbing through.
 *
 * CSS-only: no state, no portal, no positioning library. It shows on
 * group-hover and on focus-visible, so the keyboard gets the same label.
 */
export function InstantTooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 font-typewriter text-[11px] text-background opacity-0 shadow-md transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${
          side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
