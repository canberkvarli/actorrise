"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RequestPromoCodeModal } from "@/components/contact/RequestPromoCodeModal";

export function ForStudentsDiscountCTA() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="lg" className="rounded-full px-6" onClick={() => setOpen(true)}>
        Request a student discount
      </Button>
      <RequestPromoCodeModal open={open} onOpenChange={setOpen} initialType="student" />
    </>
  );
}
