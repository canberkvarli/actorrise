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
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
  /**
   * Which edge the label hangs from. Centred is right until the trigger is
   * itself at an edge: a 36px button with a "Remove from collection" label
   * centred on it puts ~60px of tooltip past the trigger on each side, which
   * on a right-aligned button leaves the label hanging outside its container
   * — clipped if anything above it clips, and off-screen on a phone if not.
   * `end` right-aligns it to the trigger so it can only ever grow inwards.
   */
  align?: "center" | "start" | "end";
}) {
  const alignment =
    align === "end"
      ? "right-0"
      : align === "start"
        ? "left-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 font-typewriter text-[11px] text-background opacity-0 shadow-md transition-opacity duration-100 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${alignment} ${
          side === "bottom" ? "top-full mt-1.5" : "bottom-full mb-1.5"
        }`}
      >
        {label}
      </span>
    </span>
  );
}
