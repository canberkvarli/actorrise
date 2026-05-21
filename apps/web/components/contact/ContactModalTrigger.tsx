"use client";

import { useState } from "react";
import { ContactModal } from "./ContactModal";

export interface ContactModalTriggerProps {
  children?: React.ReactNode;
  className?: string;
  /** "link" = link-style button, "button" = primary button, "ghost" = ghost button */
  variant?: "link" | "button" | "ghost";
}

export function ContactModalTrigger({
  children = "Contact",
  className,
  variant = "link",
}: ContactModalTriggerProps) {
  const [open, setOpen] = useState(false);

  const baseClass = "transition-colors";
  const variantClass =
    variant === "link"
      ? "hover:text-foreground text-muted-foreground"
      : variant === "button"
        ? "inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
        : "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium hover:bg-muted/60";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={[baseClass, variantClass, className].filter(Boolean).join(" ")}
      >
        {children}
      </button>
      <ContactModal open={open} onOpenChange={setOpen} />
    </>
  );
}
