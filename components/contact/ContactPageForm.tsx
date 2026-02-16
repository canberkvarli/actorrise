"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ContactModal } from "./ContactModal";

/**
 * Renders a CTA to open the contact modal. Use on the /contact page.
 */
export function ContactPageForm() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card/60 p-6">
        <p className="text-foreground mb-4">
          Partnership, feedback, bug reports, or collaboration—I built ActorRise on my own
          and really appreciate your support.
        </p>
        <Button onClick={() => setOpen(true)}>Send a message</Button>
      </div>
      <ContactModal open={open} onOpenChange={setOpen} />
    </>
  );
}
