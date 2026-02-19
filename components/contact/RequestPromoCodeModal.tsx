"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { IconBuildingStore, IconSchool } from "@tabler/icons-react";

export type PromoRequestType = "business" | "student" | null;

export interface RequestPromoCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestPromoCodeModal({ open, onOpenChange }: RequestPromoCodeModalProps) {
  const [type, setType] = useState<PromoRequestType>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const reset = () => {
    setType(null);
    setName("");
    setEmail("");
    setMessage("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!type) {
      toast.error("Please choose Business or Student.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error("Please fill in name and email.");
      return;
    }
    const category = type === "business" ? "business_discount" : "student_discount";
    setSending(true);
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>("/api/contact", {
        name: name.trim(),
        email: email.trim(),
        category,
        message: message.trim() || (type === "business" ? "Business discount code request." : "Student discount code request."),
      });
      toast.success(data?.message ?? "Request sent! I'll send you a code soon.");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            "Failed to send. You can email canberkvarli@gmail.com directly.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Get a free discount code</DialogTitle>
          <DialogDescription className="text-base">
            Tell us who you are and we&apos;ll email you a code. No code is shown on the site; you have to reach out.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-3">
            <Label className="text-base">I&apos;m a…</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType("business")}
                disabled={sending}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-left transition-colors ${
                  type === "business"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                }`}
              >
                <IconBuildingStore className="h-8 w-8" />
                <span className="font-semibold text-sm">Business / Studio</span>
                <span className="text-xs">3 months free</span>
              </button>
              <button
                type="button"
                onClick={() => setType("student")}
                disabled={sending}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-left transition-colors ${
                  type === "student"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                }`}
              >
                <IconSchool className="h-8 w-8" />
                <span className="font-semibold text-sm">Student</span>
                <span className="text-xs">6 months free</span>
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-name" className="text-sm">Name</Label>
            <Input
              id="promo-name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-email" className="text-sm">Email</Label>
            <Input
              id="promo-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="promo-message" className="text-sm">
              {type === "business" ? "Your business or studio (optional)" : type === "student" ? "School or program (optional)" : "Message (optional)"}
            </Label>
            <Textarea
              id="promo-message"
              placeholder={type === "business" ? "e.g. Acting studio, production company…" : type === "student" ? "e.g. Drama school, university…" : "Anything you want to add"}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={1000}
              disabled={sending}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
