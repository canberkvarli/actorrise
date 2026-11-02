"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ContactModal } from "./ContactModal";
import { useT } from "@/lib/i18n";

/**
 * Renders a CTA to open the contact modal. Use on the /contact page.
 */
export function ContactPageForm() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card/60 p-6">
        <p className="text-foreground mb-4">
          {t("marketingContact.formBody")}
        </p>
        <Button onClick={() => setOpen(true)}>{t("marketingContact.formButton")}</Button>
      </div>
      <ContactModal open={open} onOpenChange={setOpen} />
    </>
  );
}
