"use client";

import { useState, useEffect } from "react";
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
import { IconSchool, IconUsers } from "@tabler/icons-react";

export type PromoRequestType = "business" | "student" | null;

export type RequestPromoContext = "review" | null;

export interface RequestPromoCodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select type when opening (e.g. "student" for "Request a review" link). */
  initialType?: PromoRequestType;
  /** "review" = student didn't qualify by email, requesting manual review. */
  initialContext?: RequestPromoContext;
}

export function RequestPromoCodeModal({ open, onOpenChange, initialType = null, initialContext = null }: RequestPromoCodeModalProps) {
  const [type, setType] = useState<PromoRequestType>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const isReview = initialContext === "review" && type === "student";

  useEffect(() => {
    if (open && initialType) setType(initialType);
  }, [open, initialType]);

  const reset = () => {
    setType(null);
    setName("");
    setEmail("");
    setSchoolEmail("");
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
    const category = type === "business" ? "teacher_school_coach_discount" : "student_discount";
    let bodyMessage = message.trim() || (type === "business" ? "Discount request (teachers, schools, acting coaches)." : "Student discount request.");
    if (type === "student" && schoolEmail.trim()) {
      bodyMessage += `\n\nSchool email provided: ${schoolEmail.trim()}`;
    }
    if (isReview) {
      bodyMessage = "[Student discount review request]\n\n" + bodyMessage;
    }
    setSending(true);
    try {
      const { data } = await api.post<{ ok: boolean; message: string }>("/api/contact", {
        name: name.trim(),
        email: email.trim(),
        category,
        message: bodyMessage,
      });
      toast.success(data?.message ?? "Request sent! We'll review and email you a code.");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            "Failed to send. You can email canberk@actorrise.com directly.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Request a discount
          </DialogTitle>
          <DialogDescription className="text-base">
            We’ll review your request and email you a code. No codes are shown on the site — you’ll get yours by email after approval.
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
                <IconUsers className="h-8 w-8" />
                <span className="font-semibold text-sm">Teacher / School / Coach</span>
                <span className="text-xs">Discounted rate</span>
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
                <span className="text-xs">50% off</span>
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
          {type === "student" && (
            <div className="grid gap-2">
              <Label htmlFor="promo-school-email" className="text-sm">School email (optional)</Label>
              <Input
                id="promo-school-email"
                type="email"
                placeholder="you@school.edu"
                value={schoolEmail}
                onChange={(e) => setSchoolEmail(e.target.value)}
                disabled={sending}
              />
              <p className="text-xs text-muted-foreground">
                For current students. We may verify eligibility.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="promo-message" className="text-sm">
              {type === "business" ? "School, studio, or program (optional)" : type === "student" ? "School or program (optional)" : "Message (optional)"}
            </Label>
            <Textarea
              id="promo-message"
              placeholder={type === "business" ? "e.g. Acting studio, drama school, coaching…" : type === "student" ? "e.g. Drama school, university…" : "Anything you want to add"}
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
